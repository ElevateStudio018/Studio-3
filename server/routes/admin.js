import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { all, get, run, tx, parse, getSetting, setSetting } from '../db.js';
import { HttpError, json, readJson, send, serveFile, csv } from '../http.js';
import { createSession, destroySession, currentUser, requireAdmin, rateLimit, verifyPassword, hashPassword, sessionHash } from '../security.js';
import { sendMail, sendBulk, templates, escapeHtml, layout } from '../mailer.js';
import { syncYoutube, videoRows } from '../youtube.js';
import { THEMES } from '../../public/assets/js/themes.js';
import { APP_STATUSES, DEBATE_STATUSES, PARTIES, COUNTIES, FORMAT_NAMES } from '../content.js';
import { debateOut, isOpen, str, int, peopleIndex } from './public.js';

const SHORTLISTED = ['shortlist', 'intervju', 'uttagen', 'bekraftad'];
const APP_STATUS_IDS = new Set(APP_STATUSES.map((s) => s.id));
const age = (y) => (y ? new Date().getFullYear() - y : null);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'debatt';

function appOut(a, { full = false } = {}) {
  const dupes = get('SELECT COUNT(*) AS n FROM applications WHERE (email = ? OR (phone != \'\' AND phone = ?)) AND id != ?', a.email, a.phone, a.id).n;
  const base = {
    id: a.id, ref: a.ref, debate_id: a.debate_id, kind: a.kind, status: a.status, rating: a.rating, score: a.score, name: a.name, email: a.email,
    phone: a.phone, age: age(a.birth_year), birth_year: a.birth_year, gender: a.gender, municipality: a.municipality, county: a.county,
    occupation: a.occupation, party: a.party, party_member: !!a.party_member, office: a.office, econ: a.econ, social: a.social, stance: a.stance,
    need_label: a.need_label, tags: parse(a.tags, []), has_photo: !!a.photo, created_at: a.created_at, duplicates: dupes,
    debate_title: a.debate_title || null,
  };
  if (!full) return base;
  return {
    ...base, organisations: a.organisations, motivation: a.motivation, data: parse(a.data, {}), notes: a.notes,
    consent_political: !!a.consent_political, consent_media: !!a.consent_media, source: a.source, updated_at: a.updated_at,
    events: all('SELECT type, message, user_email, created_at FROM application_events WHERE application_id = ? ORDER BY id DESC', a.id),
    other: all('SELECT a.id, a.ref, a.status, a.created_at, d.title AS debate_title FROM applications a LEFT JOIN debates d ON d.id = a.debate_id WHERE (a.email = ? OR (a.phone != \'\' AND a.phone = ?)) AND a.id != ? ORDER BY a.id DESC', a.email, a.phone, a.id),
  };
}

function needsStatus(debate) {
  const needs = parse(debate.needs, []);
  return needs.map((n) => {
    const where = 'debate_id = ? AND need_label = ?';
    return {
      ...n,
      applied: get(`SELECT COUNT(*) AS n FROM applications WHERE ${where}`, debate.id, n.label).n,
      shortlisted: get(`SELECT COUNT(*) AS n FROM applications WHERE ${where} AND status IN (${SHORTLISTED.map(() => '?').join(',')})`, debate.id, n.label, ...SHORTLISTED).n,
    };
  });
}

function filterApplications(q) {
  const where = [];
  const p = [];
  if (q.get('debate')) {
    if (q.get('debate') === 'talangbank') where.push('a.debate_id IS NULL');
    else (where.push('a.debate_id = ?'), p.push(Number(q.get('debate'))));
  }
  if (q.get('status')) (where.push('a.status = ?'), p.push(q.get('status')));
  if (q.get('party')) (where.push('a.party = ?'), p.push(q.get('party')));
  if (q.get('county')) (where.push('a.county = ?'), p.push(q.get('county')));
  if (q.get('kind')) (where.push('a.kind = ?'), p.push(q.get('kind')));
  if (q.get('tag')) (where.push('a.tags LIKE ?'), p.push(`%"${q.get('tag')}"%`));
  if (q.get('need')) (where.push('a.need_label = ?'), p.push(q.get('need')));
  const y = new Date().getFullYear();
  if (q.get('minAge')) (where.push('a.birth_year <= ?'), p.push(y - Number(q.get('minAge'))));
  if (q.get('maxAge')) (where.push('a.birth_year >= ?'), p.push(y - Number(q.get('maxAge'))));
  if (q.get('q')) {
    where.push('(a.name LIKE ? OR a.email LIKE ? OR a.municipality LIKE ? OR a.ref LIKE ? OR a.occupation LIKE ? OR a.motivation LIKE ?)');
    const like = `%${q.get('q')}%`;
    p.push(like, like, like, like, like, like);
  }
  const order = { score: 'a.score DESC, a.id DESC', rating: 'a.rating DESC, a.score DESC', name: 'a.name COLLATE NOCASE ASC', old: 'a.created_at ASC, a.id ASC' }[q.get('sort')] || 'a.created_at DESC, a.id DESC';
  return { sql: `FROM applications a LEFT JOIN debates d ON d.id = a.debate_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, p, order };
}

function logEvent(appId, type, message, user) {
  run('INSERT INTO application_events (application_id, type, message, user_email) VALUES (?, ?, ?, ?)', appId, type, message, user?.email || null);
}

function textToHtml(text) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a style="color:#F1944F" href="$1">$1</a>')}</p>`)
    .join('');
}

/** Skapar och skickar ett nyhetsbrev till ett segment. */
export function sendCampaign({ subject, body, segment, county, auto = false }) {
  const where = ["status = 'confirmed'"];
  const p = [];
  if (segment && segment !== 'alla') (where.push('prefs LIKE ?'), p.push(`%"${segment}"%`));
  if (county) (where.push('(county = ? OR county IS NULL)'), p.push(county));
  const subs = all(`SELECT * FROM subscribers WHERE ${where.join(' AND ')}`, ...p);
  const html = textToHtml(body);
  const { lastInsertRowid } = run("INSERT INTO campaigns (subject, body, segment, status, recipients, auto, sent_at) VALUES (?, ?, ?, 'skickad', ?, ?, datetime('now'))",
    subject, body, segment || 'alla', subs.length, auto ? 1 : 0);
  sendBulk(subs.map((s) => ({ to: s.email, ...templates.newsletter(s, subject, html), kind: 'nyhetsbrev' })));
  return { id: Number(lastInsertRowid), recipients: subs.length };
}

export function announceDebate(d) {
  const deadline = d.deadline ? `\n\nSista ansökningsdag: ${d.deadline.slice(0, 10)}.` : '';
  return sendCampaign({
    subject: `Ny debatt: ${d.title} – sök nu`,
    body: `${d.summary || d.statement || ''}${deadline}\n\nSök här: ${config.siteUrl}/sok/${d.slug}`,
    segment: 'debatter',
    auto: true,
  });
}

export function announceVideos(ids) {
  const vids = ids.map((id) => get('SELECT * FROM videos WHERE id = ?', id)).filter(Boolean);
  if (!vids.length) return null;
  return sendCampaign({
    subject: vids.length === 1 ? `Nytt avsnitt: ${vids[0].display || vids[0].title}` : `${vids.length} nya avsnitt från STUDIO 3`,
    body: vids.map((v) => `${v.display || v.title}\nhttps://www.youtube.com/watch?v=${v.id}`).join('\n\n'),
    segment: 'videor',
    auto: true,
  });
}

function readDebate(b, existing) {
  const d = {
    title: str(b.title, 160), format: FORMAT_NAMES[b.format] ? b.format : 'ovrigt', statement: str(b.statement, 400), summary: str(b.summary, 400),
    description: str(b.description, 6000), event_at: str(b.event_at, 20) || null, location: str(b.location, 160), deadline: str(b.deadline, 20) || null,
    spots: int(b.spots, 0, 1000), cover_url: str(b.cover_url, 400) || null, youtube_url: str(b.youtube_url, 300) || null,
    status: DEBATE_STATUSES.some((s) => s.id === b.status) ? b.status : 'draft', featured: b.featured ? 1 : 0,
    audience_seats: int(b.audience_seats, 0, 2000) || 0,
    needs: JSON.stringify((Array.isArray(b.needs) ? b.needs : []).slice(0, 12).map((n) => ({
      label: str(n.label, 120), count: int(n.count, 0, 1000) || 0,
      parties: Array.isArray(n.parties) ? n.parties.filter((x) => PARTIES.some((p) => p.id === x)) : undefined,
      stance: ['for', 'emot', 'neutral'].includes(n.stance) ? n.stance : undefined,
    })).filter((n) => n.label)),
    questions: JSON.stringify((Array.isArray(b.questions) ? b.questions : []).slice(0, 15).map((q, i) => ({
      id: str(q.id, 40) || `q${i + 1}`, label: str(q.label, 300), type: ['text', 'textarea', 'select', 'yesno'].includes(q.type) ? q.type : 'text',
      options: Array.isArray(q.options) ? q.options.map((o) => str(o, 120)).filter(Boolean) : undefined, required: !!q.required,
    })).filter((q) => q.label)),
  };
  if (d.title.length < 3) throw new HttpError(422, 'Debatten behöver en titel.', { title: 'Skriv en titel.' });
  let slug = slugify(str(b.slug, 80) || d.title);
  const clash = (s) => get('SELECT id FROM debates WHERE slug = ? AND id != ?', s, existing?.id ?? 0);
  for (let i = 2; clash(slug); i++) slug = `${slugify(str(b.slug, 80) || d.title)}-${i}`;
  d.slug = slug;
  return d;
}

export function registerAdmin(r) {
  r.post('/api/admin/login', async (req, res) => {
    rateLimit(req, 'login', 8, 10 * 60_000);
    const b = await readJson(req);
    const user = get('SELECT * FROM users WHERE email = ?', str(b.email, 200).toLowerCase());
    if (!user || !verifyPassword(str(b.password, 200), user.pass_hash)) throw new HttpError(401, 'Fel e-post eller lösenord.');
    createSession(res, user.id);
    json(res, 200, { ok: true, user: { email: user.email, name: user.name, role: user.role } });
  });

  r.post('/api/admin/logout', (req, res) => {
    destroySession(req, res);
    json(res, 200, { ok: true });
  });

  r.get('/api/admin/me', (req, res) => {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Inte inloggad.');
    json(res, 200, { user, meta: { appStatuses: APP_STATUSES, debateStatuses: DEBATE_STATUSES, parties: PARTIES, counties: COUNTIES, formats: FORMAT_NAMES, mailLive: !!config.mail.resendKey, siteUrl: config.siteUrl } });
  });

  // ---------- översikt ----------
  r.get('/api/admin/dashboard', (req, res) => {
    requireAdmin(req);
    const n = (sql, ...p) => get(sql, ...p).n;
    const days = all("SELECT date(created_at) AS day, COUNT(*) AS n FROM applications WHERE created_at >= date('now','-29 days') GROUP BY day");
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      series.push({ day: d, n: days.find((x) => x.day === d)?.n || 0 });
    }
    const funnel = Object.fromEntries(all("SELECT event, SUM(count) AS n FROM analytics WHERE day >= date('now','-29 days') GROUP BY event").map((r) => [r.event, r.n]));
    const open = all("SELECT * FROM debates WHERE status = 'open' ORDER BY deadline ASC").map((d) => ({ ...debateOut(d), open: isOpen(d), needsStatus: needsStatus(d) }));
    json(res, 200, {
      kpi: {
        applications: n('SELECT COUNT(*) AS n FROM applications'),
        applications7: n("SELECT COUNT(*) AS n FROM applications WHERE created_at >= datetime('now','-7 days')"),
        unread: n("SELECT COUNT(*) AS n FROM applications WHERE status = 'ny'"),
        openDebates: open.length,
        subscribers: n("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'confirmed'"),
        subscribersPending: n("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'pending'"),
        leads: n("SELECT COUNT(*) AS n FROM leads WHERE status = 'ny'"),
        pipeline: get("SELECT COALESCE(SUM(value_sek),0) AS n FROM leads WHERE status IN ('ny','kontaktad','offert')").n,
      },
      series,
      parties: all("SELECT COALESCE(NULLIF(party,''),'EJ') AS party, COUNT(*) AS n FROM applications WHERE kind = 'deltagare' GROUP BY 1 ORDER BY n DESC"),
      funnel,
      open,
      latest: all('SELECT a.*, d.title AS debate_title FROM applications a LEFT JOIN debates d ON d.id = a.debate_id ORDER BY a.created_at DESC, a.id DESC LIMIT 8').map((a) => appOut(a)),
      youtube: getSetting('youtubeSync', null),
      channel: getSetting('channelStats', {}),
    });
  });

  // ---------- debatter ----------
  r.get('/api/admin/debates', (req, res) => {
    requireAdmin(req);
    json(res, 200, all('SELECT * FROM debates ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END, COALESCE(event_at, created_at) DESC')
      .map((d) => ({ ...debateOut(d, { admin: true }), open: isOpen(d), needsStatus: needsStatus(d) })));
  });

  r.get('/api/admin/debates/:id', (req, res, { params }) => {
    requireAdmin(req);
    const d = get('SELECT * FROM debates WHERE id = ?', Number(params.id));
    if (!d) throw new HttpError(404, 'Hittades inte.');
    const apps = all("SELECT party, econ, social, stance, status, need_label FROM applications WHERE debate_id = ? AND kind = 'deltagare'", d.id);
    json(res, 200, { ...debateOut(d, { admin: true }), open: isOpen(d), needsStatus: needsStatus(d), compass: apps });
  });

  const saveDebate = async (req, res, existing) => {
    const user = requireAdmin(req);
    const b = await readJson(req);
    const d = readDebate(b, existing);
    const cols = Object.keys(d);
    let id = existing?.id;
    if (existing) {
      run(`UPDATE debates SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now'), opened_at = CASE WHEN ? = 'open' AND opened_at IS NULL THEN datetime('now') ELSE opened_at END WHERE id = ?`,
        ...cols.map((c) => d[c]), d.status, existing.id);
    } else {
      id = Number(run(`INSERT INTO debates (${cols.join(', ')}, opened_at) VALUES (${cols.map(() => '?').join(', ')}, CASE WHEN ? = 'open' THEN datetime('now') END)`, ...cols.map((c) => d[c]), d.status).lastInsertRowid);
    }
    const saved = get('SELECT * FROM debates WHERE id = ?', id);
    let campaign = null;
    if (b.notify && saved.status === 'open') campaign = announceDebate(saved);
    json(res, existing ? 200 : 201, { ...debateOut(saved, { admin: true }), campaign, by: user.email });
  };
  r.post('/api/admin/debates', (req, res) => saveDebate(req, res, null));
  r.put('/api/admin/debates/:id', (req, res, { params }) => {
    const existing = get('SELECT * FROM debates WHERE id = ?', Number(params.id));
    if (!existing) throw new HttpError(404, 'Hittades inte.');
    return saveDebate(req, res, existing);
  });
  r.post('/api/admin/debates/:id/duplicate', (req, res, { params }) => {
    requireAdmin(req);
    const d = get('SELECT * FROM debates WHERE id = ?', Number(params.id));
    if (!d) throw new HttpError(404, 'Hittades inte.');
    let slug = `${d.slug}-kopia`;
    for (let i = 2; get('SELECT id FROM debates WHERE slug = ?', slug); i++) slug = `${d.slug}-kopia-${i}`;
    const { lastInsertRowid } = run(
      `INSERT INTO debates (slug, title, format, statement, summary, description, event_at, location, deadline, spots, needs, questions, cover_url, status, audience_seats)
       SELECT ?, title || ' (kopia)', format, statement, summary, description, NULL, location, NULL, spots, needs, questions, cover_url, 'draft', audience_seats FROM debates WHERE id = ?`, slug, d.id);
    json(res, 201, { id: Number(lastInsertRowid) });
  });
  r.delete('/api/admin/debates/:id', (req, res, { params }) => {
    requireAdmin(req);
    run('DELETE FROM debates WHERE id = ?', Number(params.id));
    json(res, 200, { ok: true });
  });

  // ---------- ansökningar ----------
  r.get('/api/admin/applications', (req, res, { query }) => {
    requireAdmin(req);
    const { sql, p, order } = filterApplications(query);
    const limit = Math.min(500, Number(query.get('limit')) || 200);
    const offset = Number(query.get('offset')) || 0;
    const rows = all(`SELECT a.*, d.title AS debate_title ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, limit, offset);
    const counts = Object.fromEntries(all(`SELECT a.status AS s, COUNT(*) AS n ${sql} GROUP BY a.status`, ...p).map((r) => [r.s, r.n]));
    json(res, 200, { total: get(`SELECT COUNT(*) AS n ${sql}`, ...p).n, counts, items: rows.map((a) => appOut(a)) });
  });

  r.get('/api/admin/applications/:id', (req, res, { params }) => {
    requireAdmin(req);
    const a = get('SELECT a.*, d.title AS debate_title FROM applications a LEFT JOIN debates d ON d.id = a.debate_id WHERE a.id = ?', Number(params.id));
    if (!a) throw new HttpError(404, 'Hittades inte.');
    json(res, 200, appOut(a, { full: true }));
  });

  r.get('/api/admin/applications/:id/photo', (req, res, { params }) => {
    requireAdmin(req);
    const a = get('SELECT photo FROM applications WHERE id = ?', Number(params.id));
    const file = a?.photo && path.join(config.dataDir, 'uploads', path.basename(a.photo));
    if (!file || !serveFile(req, res, file, { cache: 'private, max-age=600' })) throw new HttpError(404, 'Ingen bild.');
  });

  r.patch('/api/admin/applications/:id', async (req, res, { params }) => {
    const user = requireAdmin(req);
    const b = await readJson(req);
    const a = get('SELECT * FROM applications WHERE id = ?', Number(params.id));
    if (!a) throw new HttpError(404, 'Hittades inte.');
    if (b.status && APP_STATUS_IDS.has(b.status) && b.status !== a.status) {
      run("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?", b.status, a.id);
      logEvent(a.id, 'status', `${a.status} → ${b.status}`, user);
    }
    if (b.rating != null) run('UPDATE applications SET rating = ? WHERE id = ?', int(b.rating, 0, 5), a.id);
    if (Array.isArray(b.tags)) run('UPDATE applications SET tags = ? WHERE id = ?', JSON.stringify(b.tags.map((t) => str(t, 40)).filter(Boolean).slice(0, 20)), a.id);
    if (typeof b.notes === 'string') {
      run("UPDATE applications SET notes = ?, updated_at = datetime('now') WHERE id = ?", str(b.notes, 5000), a.id);
    }
    if (b.debate_id !== undefined) {
      const d = b.debate_id ? get('SELECT id, title FROM debates WHERE id = ?', Number(b.debate_id)) : null;
      run('UPDATE applications SET debate_id = ? WHERE id = ?', d?.id ?? null, a.id);
      logEvent(a.id, 'flyttad', `Flyttad till ${d ? d.title : 'talangbanken'}`, user);
    }
    const out = get('SELECT a.*, d.title AS debate_title FROM applications a LEFT JOIN debates d ON d.id = a.debate_id WHERE a.id = ?', a.id);
    json(res, 200, appOut(out, { full: true }));
  });

  r.post('/api/admin/applications/bulk', async (req, res) => {
    const user = requireAdmin(req);
    const b = await readJson(req);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 1000);
    if (!ids.length) throw new HttpError(400, 'Inga ansökningar valda.');
    let affected = 0;
    tx(() => {
      for (const id of ids) {
        const a = get('SELECT * FROM applications WHERE id = ?', id);
        if (!a) continue;
        affected++;
        if (b.action === 'status' && APP_STATUS_IDS.has(b.status) && b.status !== a.status) {
          run("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?", b.status, id);
          logEvent(id, 'status', `${a.status} → ${b.status}`, user);
        } else if (b.action === 'tag' && str(b.tag, 40)) {
          const tags = new Set(parse(a.tags, []));
          tags.add(str(b.tag, 40));
          run('UPDATE applications SET tags = ? WHERE id = ?', JSON.stringify([...tags]), id);
        } else if (b.action === 'delete') {
          if (a.photo) fs.rmSync(path.join(config.dataDir, 'uploads', path.basename(a.photo)), { force: true });
          run('DELETE FROM applications WHERE id = ?', id);
        }
      }
    });
    if (b.action === 'email' && ['invite', 'reject'].includes(b.template)) {
      for (const id of ids) {
        const a = get('SELECT * FROM applications WHERE id = ?', id);
        if (!a) continue;
        const d = a.debate_id ? get('SELECT * FROM debates WHERE id = ?', a.debate_id) : null;
        sendMail({ to: a.email, ...templates[b.template](a, d, str(b.message, 3000)), kind: b.template });
        logEvent(id, 'mejl', b.template === 'invite' ? 'Inbjudan skickad' : 'Nej tack skickat', user);
      }
    }
    json(res, 200, { ok: true, affected });
  });

  r.post('/api/admin/applications/:id/email', async (req, res, { params }) => {
    const user = requireAdmin(req);
    const b = await readJson(req);
    const a = get('SELECT * FROM applications WHERE id = ?', Number(params.id));
    if (!a) throw new HttpError(404, 'Hittades inte.');
    const d = a.debate_id ? get('SELECT * FROM debates WHERE id = ?', a.debate_id) : null;
    let msg;
    if (b.template === 'invite' || b.template === 'reject') msg = templates[b.template](a, d, str(b.message, 3000));
    else {
      const subject = str(b.subject, 200);
      if (!subject || !str(b.message, 5000)) throw new HttpError(422, 'Ämne och meddelande krävs.');
      msg = { subject, html: layout({ title: subject, body: textToHtml(str(b.message, 5000)) }) };
    }
    const result = await sendMail({ to: a.email, ...msg, kind: b.template || 'fritt' });
    logEvent(a.id, 'mejl', `${msg.subject}`, user);
    json(res, 200, result);
  });

  r.delete('/api/admin/applications/:id', (req, res, { params }) => {
    requireAdmin(req);
    const a = get('SELECT photo FROM applications WHERE id = ?', Number(params.id));
    if (a?.photo) fs.rmSync(path.join(config.dataDir, 'uploads', path.basename(a.photo)), { force: true });
    run('DELETE FROM applications WHERE id = ?', Number(params.id));
    json(res, 200, { ok: true });
  });

  // ---------- export ----------
  const sendCsv = (res, name, body) => send(res, 200, body, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  r.get('/api/admin/export/applications.csv', (req, res, { query }) => {
    requireAdmin(req);
    const { sql, p, order } = filterApplications(query);
    const rows = all(`SELECT a.*, d.title AS debate_title ${sql} ORDER BY ${order}`, ...p);
    const data = (r) => parse(r.data, {});
    sendCsv(res, `ansokningar-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows, [
      { label: 'Ref', value: 'ref' }, { label: 'Debatt', value: (r) => r.debate_title || 'Talangbank' }, { label: 'Typ', value: 'kind' },
      { label: 'Status', value: 'status' }, { label: 'Betyg', value: 'rating' }, { label: 'Matchning', value: 'score' }, { label: 'Namn', value: 'name' },
      { label: 'E-post', value: 'email' }, { label: 'Telefon', value: 'phone' }, { label: 'Ålder', value: (r) => age(r.birth_year) }, { label: 'Kön', value: 'gender' },
      { label: 'Kommun', value: 'municipality' }, { label: 'Län', value: 'county' }, { label: 'Yrke', value: 'occupation' }, { label: 'Parti', value: 'party' },
      { label: 'Medlem', value: (r) => (r.party_member ? 'Ja' : 'Nej') }, { label: 'Uppdrag', value: 'office' }, { label: 'Organisationer', value: 'organisations' },
      { label: 'Ekonomisk skala', value: 'econ' }, { label: 'GAL-TAN', value: 'social' }, { label: 'Ståndpunkt', value: 'stance' }, { label: 'Grupp', value: 'need_label' },
      { label: 'Motivering', value: 'motivation' }, { label: 'Tillgänglig', value: (r) => data(r).availability }, { label: 'Instagram', value: (r) => data(r).socials?.instagram },
      { label: 'TikTok', value: (r) => data(r).socials?.tiktok }, { label: 'Videolänk', value: (r) => data(r).video_link }, { label: 'Taggar', value: (r) => parse(r.tags, []).join(', ') },
      { label: 'Anteckningar', value: 'notes' }, { label: 'Inkommen', value: 'created_at' },
    ]));
  });
  r.get('/api/admin/export/subscribers.csv', (req, res) => {
    requireAdmin(req);
    sendCsv(res, 'prenumeranter.csv', csv(all('SELECT * FROM subscribers ORDER BY id DESC'), [
      { label: 'E-post', value: 'email' }, { label: 'Namn', value: 'name' }, { label: 'Status', value: 'status' }, { label: 'Intressen', value: (r) => parse(r.prefs, []).join(', ') },
      { label: 'Län', value: 'county' }, { label: 'Källa', value: 'source' }, { label: 'Skapad', value: 'created_at' }, { label: 'Bekräftad', value: 'confirmed_at' },
    ]));
  });
  r.get('/api/admin/export/leads.csv', (req, res) => {
    requireAdmin(req);
    sendCsv(res, 'forfragningar.csv', csv(all('SELECT * FROM leads ORDER BY id DESC'), [
      { label: 'Typ', value: 'type' }, { label: 'Organisation', value: 'organisation' }, { label: 'Namn', value: 'name' }, { label: 'E-post', value: 'email' },
      { label: 'Telefon', value: 'phone' }, { label: 'Budget', value: 'budget' }, { label: 'Önskat datum', value: 'date_wish' }, { label: 'Status', value: 'status' },
      { label: 'Värde (kr)', value: 'value_sek' }, { label: 'Meddelande', value: 'message' }, { label: 'Skapad', value: 'created_at' },
    ]));
  });

  // ---------- nyhetsbrev ----------
  r.get('/api/admin/subscribers', (req, res, { query }) => {
    requireAdmin(req);
    const where = [];
    const p = [];
    if (query.get('status')) (where.push('status = ?'), p.push(query.get('status')));
    if (query.get('pref')) (where.push('prefs LIKE ?'), p.push(`%"${query.get('pref')}"%`));
    if (query.get('q')) (where.push('(email LIKE ? OR name LIKE ?)'), p.push(`%${query.get('q')}%`, `%${query.get('q')}%`));
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    json(res, 200, {
      total: get(`SELECT COUNT(*) AS n FROM subscribers ${w}`, ...p).n,
      segments: Object.fromEntries(['debatter', 'videor', 'event'].map((s) => [s, get("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'confirmed' AND prefs LIKE ?", `%"${s}"%`).n])),
      confirmed: get("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'confirmed'").n,
      items: all(`SELECT id, email, name, prefs, county, status, source, created_at, confirmed_at FROM subscribers ${w} ORDER BY id DESC LIMIT 500`, ...p).map((s) => ({ ...s, prefs: parse(s.prefs, []) })),
    });
  });
  r.delete('/api/admin/subscribers/:id', (req, res, { params }) => {
    requireAdmin(req);
    run('DELETE FROM subscribers WHERE id = ?', Number(params.id));
    json(res, 200, { ok: true });
  });
  r.get('/api/admin/campaigns', (req, res) => {
    requireAdmin(req);
    json(res, 200, all('SELECT * FROM campaigns ORDER BY id DESC LIMIT 100'));
  });
  r.post('/api/admin/campaigns', async (req, res) => {
    requireAdmin(req);
    const b = await readJson(req);
    const subject = str(b.subject, 200);
    const body = str(b.body, 20000);
    if (!subject || body.length < 10) throw new HttpError(422, 'Ämne och text krävs.');
    if (b.test) {
      const html = textToHtml(body);
      await sendMail({ to: req.user.email, ...templates.newsletter({ token: 'test' }, `[TEST] ${subject}`, html), kind: 'test' });
      return json(res, 200, { ok: true, test: true });
    }
    json(res, 201, sendCampaign({ subject, body, segment: ['alla', 'debatter', 'videor', 'event'].includes(b.segment) ? b.segment : 'alla', county: str(b.county, 40) || null }));
  });
  r.get('/api/admin/campaigns/draft-videos', (req, res) => {
    requireAdmin(req);
    const vids = all('SELECT * FROM videos WHERE hidden = 0 ORDER BY position ASC LIMIT 3');
    json(res, 200, {
      subject: `Nytt på STUDIO 3: ${vids[0]?.display || ''}`,
      body: `Hej!\n\nHär är det senaste från STUDIO 3:\n\n${vids.map((v) => `▶ ${v.display || v.title}\nhttps://www.youtube.com/watch?v=${v.id}`).join('\n\n')}\n\nVill du själv sitta i stolen? Se alla öppna debatter: ${config.siteUrl}/#debatter`,
    });
  });

  // ---------- videor ----------
  r.get('/api/admin/videos', (req, res) => {
    requireAdmin(req);
    json(res, 200, { items: videoRows({ includeHidden: true }), sync: getSetting('youtubeSync', null), people: peopleIndex(videoRows()).length });
  });
  r.patch('/api/admin/videos/:id', async (req, res, { params }) => {
    requireAdmin(req);
    const b = await readJson(req);
    const v = get('SELECT * FROM videos WHERE id = ?', params.id);
    if (!v) throw new HttpError(404, 'Hittades inte.');
    if (b.hidden != null) run('UPDATE videos SET hidden = ? WHERE id = ?', b.hidden ? 1 : 0, v.id);
    if (b.pinned != null) run('UPDATE videos SET pinned = ? WHERE id = ?', b.pinned ? 1 : 0, v.id);
    if (b.format && FORMAT_NAMES[b.format]) run('UPDATE videos SET format = ? WHERE id = ?', b.format, v.id);
    if (typeof b.display === 'string') run('UPDATE videos SET display = ? WHERE id = ?', str(b.display, 200) || v.title, v.id);
    if (Array.isArray(b.people)) run('UPDATE videos SET people = ? WHERE id = ?', JSON.stringify(b.people.map((x) => str(x, 80)).filter(Boolean)), v.id);
    json(res, 200, { ok: true });
  });
  r.post('/api/admin/videos/sync', async (req, res) => {
    requireAdmin(req);
    try {
      const fresh = await syncYoutube();
      const site = getSetting('site', {});
      const campaign = fresh.length && site.autoNotifyVideos ? announceVideos(fresh) : null;
      json(res, 200, { ok: true, fresh, campaign });
    } catch (err) {
      setSetting('youtubeSync', { at: new Date().toISOString(), ok: false, error: String(err.message || err) });
      throw new HttpError(502, `Kunde inte nå YouTube: ${err.message}`);
    }
  });

  // ---------- förfrågningar ----------
  r.get('/api/admin/leads', (req, res) => {
    requireAdmin(req);
    json(res, 200, all('SELECT * FROM leads ORDER BY id DESC LIMIT 500'));
  });
  r.patch('/api/admin/leads/:id', async (req, res, { params }) => {
    requireAdmin(req);
    const b = await readJson(req);
    const l = get('SELECT * FROM leads WHERE id = ?', Number(params.id));
    if (!l) throw new HttpError(404, 'Hittades inte.');
    const status = ['ny', 'kontaktad', 'offert', 'vunnen', 'forlorad'].includes(b.status) ? b.status : l.status;
    run("UPDATE leads SET status = ?, value_sek = ?, notes = ?, updated_at = datetime('now') WHERE id = ?", status,
      b.value_sek === '' || b.value_sek == null ? l.value_sek : int(b.value_sek, 0, 1e9), typeof b.notes === 'string' ? str(b.notes, 5000) : l.notes, l.id);
    json(res, 200, get('SELECT * FROM leads WHERE id = ?', l.id));
  });
  r.delete('/api/admin/leads/:id', (req, res, { params }) => {
    requireAdmin(req);
    run('DELETE FROM leads WHERE id = ?', Number(params.id));
    json(res, 200, { ok: true });
  });

  // ---------- utkorg ----------
  r.get('/api/admin/outbox', (req, res) => {
    requireAdmin(req);
    json(res, 200, { live: !!config.mail.resendKey, items: all('SELECT id, to_email, subject, kind, status, error, created_at, sent_at FROM outbox ORDER BY id DESC LIMIT 300') });
  });
  r.get('/api/admin/outbox/:id', (req, res, { params }) => {
    requireAdmin(req);
    const m = get('SELECT * FROM outbox WHERE id = ?', Number(params.id));
    if (!m) throw new HttpError(404, 'Hittades inte.');
    json(res, 200, m);
  });

  // ---------- inställningar ----------
  r.get('/api/admin/settings', (req, res) => {
    requireAdmin(req);
    json(res, 200, { site: getSetting('site', {}), themes: THEMES.map(({ id, name, tagline }) => ({ id, name, tagline })), channel: getSetting('channelStats', {}), users: all('SELECT id, email, name, role, created_at, last_login FROM users ORDER BY id') });
  });
  const SITE_KEYS = ['name', 'slogan', 'subline', 'endline', 'announcement', 'heroVideo', 'heroVideoMobile', 'heroPoster', 'heroIntroEnd', 'heroEndAt', 'theme', 'contactEmail', 'swish',
    'notifyEmail', 'retentionMonths', 'autoNotifyVideos', 'socials', 'about', 'team', 'steps', 'faq', 'partner'];
  r.put('/api/admin/settings', async (req, res) => {
    requireAdmin(req);
    const b = await readJson(req, 300_000);
    const site = getSetting('site', {});
    for (const k of SITE_KEYS) if (b[k] !== undefined) site[k] = b[k];
    if (!THEMES.some((t) => t.id === site.theme)) site.theme = 'studio';
    site.retentionMonths = int(site.retentionMonths, 0, 120) ?? 12;
    for (const k of ['heroIntroEnd', 'heroEndAt']) site[k] = Number.isFinite(Number(site[k])) ? Number(site[k]) : undefined;
    setSetting('site', site);
    if (b.channelStats) {
      const prev = getSetting('channelStats', {});
      setSetting('channelStats', { ...prev, subscribers: int(b.channelStats.subscribers, 0, 1e10) ?? prev.subscribers, views: int(b.channelStats.views, 0, 1e12) ?? prev.views, videos: int(b.channelStats.videos, 0, 1e6) ?? prev.videos, updatedAt: new Date().toISOString(), source: 'manuell' });
    }
    json(res, 200, { ok: true, site });
  });
  r.put('/api/admin/password', async (req, res) => {
    const user = requireAdmin(req);
    const b = await readJson(req);
    const row = get('SELECT * FROM users WHERE id = ?', user.id);
    if (!verifyPassword(str(b.current, 200), row.pass_hash)) throw new HttpError(422, 'Nuvarande lösenord stämmer inte.', { current: 'Fel lösenord.' });
    if (str(b.next, 200).length < 10) throw new HttpError(422, 'Minst 10 tecken.', { next: 'Minst 10 tecken.' });
    run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(str(b.next, 200)), user.id);
    run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, sessionHash(req));
    json(res, 200, { ok: true });
  });
  r.post('/api/admin/users', async (req, res) => {
    const user = requireAdmin(req);
    if (user.role !== 'admin') throw new HttpError(403, 'Endast administratörer kan lägga till användare.');
    const b = await readJson(req);
    const email = str(b.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'Ogiltig e-post.', { email: 'Ogiltig e-post.' });
    if (str(b.password, 200).length < 10) throw new HttpError(422, 'Lösenordet måste vara minst 10 tecken.', { password: 'Minst 10 tecken.' });
    if (get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'Användaren finns redan.');
    run('INSERT INTO users (email, name, pass_hash, role) VALUES (?, ?, ?, ?)', email, str(b.name, 120), hashPassword(str(b.password, 200)), b.role === 'admin' ? 'admin' : 'redaktor');
    json(res, 201, { ok: true });
  });
  r.delete('/api/admin/users/:id', (req, res, { params }) => {
    const user = requireAdmin(req);
    if (user.role !== 'admin') throw new HttpError(403, 'Endast administratörer.');
    if (Number(params.id) === user.id) throw new HttpError(400, 'Du kan inte ta bort dig själv.');
    run('DELETE FROM users WHERE id = ?', Number(params.id));
    json(res, 200, { ok: true });
  });
}

/** Radera ansökningar äldre än inställd lagringstid (GDPR). */
export function retentionSweep() {
  const months = getSetting('site', {}).retentionMonths ?? 12;
  if (!months) return 0;
  const old = all(`SELECT id, photo FROM applications WHERE created_at < datetime('now', ?)`, `-${months} months`);
  for (const a of old) {
    if (a.photo) fs.rmSync(path.join(config.dataDir, 'uploads', path.basename(a.photo)), { force: true });
    run('DELETE FROM applications WHERE id = ?', a.id);
  }
  run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  return old.length;
}

