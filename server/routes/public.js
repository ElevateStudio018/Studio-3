import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { all, get, run, tx, parse, getSetting, track } from '../db.js';
import { HttpError, json, readJson, redirect, send } from '../http.js';
import { rateLimit, randomToken, hashIp } from '../security.js';
import { sendMail, templates, notifyAdmins, escapeHtml } from '../mailer.js';
import { videoRows, loadChannel } from '../youtube.js';
import { PARTIES, COUNTIES, FORMAT_NAMES } from '../content.js';

export const str = (x, max = 500) => (typeof x === 'string' ? x.trim().slice(0, max) : typeof x === 'number' ? String(x) : '');
export const int = (x, min, max) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PARTY_IDS = new Set(PARTIES.map((p) => p.id));

export function debateOut(d, { admin = false } = {}) {
  if (!d) return null;
  const out = {
    id: d.id, slug: d.slug, title: d.title, format: d.format, formatName: FORMAT_NAMES[d.format] || d.format,
    statement: d.statement, summary: d.summary, description: d.description, event_at: d.event_at, location: d.location,
    deadline: d.deadline, spots: d.spots, status: d.status, youtube_url: d.youtube_url, featured: !!d.featured,
    cover_url: d.cover_url, audience_seats: d.audience_seats, needs: parse(d.needs, []), questions: parse(d.questions, []),
    applicants: get('SELECT COUNT(*) AS n FROM applications WHERE debate_id = ?', d.id).n,
  };
  if (admin) Object.assign(out, { created_at: d.created_at, updated_at: d.updated_at, opened_at: d.opened_at });
  return out;
}

/** Är ansökan fortfarande öppen? Stänger automatiskt efter sista ansökningsdag. */
export const isOpen = (d) => d.status === 'open' && (!d.deadline || new Date(d.deadline) > new Date());

function publicSite() {
  const s = getSetting('site', {});
  const { notifyEmail, retentionMonths, autoNotifyVideos, ...pub } = s;
  return pub;
}

export function peopleIndex(videos) {
  const meta = Object.fromEntries(loadChannel().people.map((p) => [p.name, p]));
  const map = new Map();
  for (const v of videos) {
    for (const name of v.people) {
      const p = map.get(name) || { name, slug: meta[name]?.slug || name.toLowerCase().replace(/[^a-z0-9åäöéü]+/g, '-'), party: meta[name]?.party || null, role: meta[name]?.role || null, videos: [], views: 0 };
      p.videos.push(v.id);
      p.views += v.views || 0;
      map.set(name, p);
    }
  }
  return [...map.values()].sort((a, b) => b.videos.length - a.videos.length || b.views - a.views);
}

export function bootstrap() {
  const ch = loadChannel();
  const videos = videoRows();
  const stats = getSetting('channelStats', ch.channel);
  const debates = all("SELECT * FROM debates WHERE status IN ('open','closed','recorded','published') ORDER BY featured DESC, COALESCE(deadline, event_at) ASC")
    .map((d) => ({ ...debateOut(d), open: isOpen(d) }));
  const formats = ch.formats.map((f) => {
    const vs = videos.filter((v) => v.format === f.key);
    return { ...f, count: vs.length, views: vs.reduce((s, v) => s + (v.views || 0), 0), top: vs.sort((a, b) => (b.views || 0) - (a.views || 0))[0]?.id || f.top };
  });
  return {
    site: publicSite(),
    stats: { subscribers: stats.subscribers, views: stats.views, videos: stats.videos, longform: videos.length, joined: ch.channel.joined, topViews: Math.max(...videos.map((v) => v.views || 0)) },
    channel: { url: ch.channel.url, handle: ch.channel.handle, bannerQuote: ch.channel.bannerQuote },
    formats, videos, people: peopleIndex(videos), debates,
    press: ch.press, quotes: ch.quotes, events: ch.events,
    parties: PARTIES, counties: COUNTIES, formatNames: FORMAT_NAMES,
  };
}

/** Matchningspoäng 0–100 som hjälper redaktionen att sortera (inte ett beslut). */
export function scoreApplication(a, debate) {
  let s = 20;
  s += Math.min(20, Math.floor((a.motivation || '').length / 15));
  if (a.photo) s += 8;
  if (a.video_link) s += 8;
  if (a.socials && Object.values(a.socials).some(Boolean)) s += 4;
  if (a.media_experience) s += 6;
  s += a.availability === 'ja' ? 12 : a.availability === 'kanske' ? 4 : 0;
  if (Math.abs(a.stance ?? 0) === 2) s += 7;
  const needs = debate ? parse(debate.needs, []) : [];
  if (needs.length) {
    const fit = needs.some((n) => n.label === a.need_label && (!n.parties || n.parties.includes(a.party)) &&
      (!n.stance || (n.stance === 'for' ? a.stance > 0 : a.stance < 0)));
    if (fit) s += 15;
  } else s += 8;
  return Math.max(0, Math.min(100, s));
}

function savePhoto(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Bilden kunde inte läsas.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2_500_000) throw new HttpError(413, 'Bilden är för stor (max 2,5 MB).');
  const magic = buf.subarray(0, 4).toString('hex');
  const ok = magic.startsWith('ffd8ff') || magic === '89504e47' || buf.subarray(8, 12).toString() === 'WEBP';
  if (!ok) throw new HttpError(400, 'Filen är ingen giltig bild.');
  const name = `${randomToken(12)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(config.dataDir, 'uploads', name), buf);
  return name;
}

export function createSubscriber({ email, name, prefs, county, source }) {
  const existing = get('SELECT * FROM subscribers WHERE email = ?', email);
  if (existing && existing.status === 'confirmed') {
    run('UPDATE subscribers SET prefs = ?, county = COALESCE(?, county) WHERE id = ?', JSON.stringify(prefs), county || null, existing.id);
    return { status: 'already' };
  }
  const token = existing?.token || randomToken(24);
  if (existing) run("UPDATE subscribers SET prefs = ?, county = ?, name = COALESCE(?, name), status = 'pending', unsubscribed_at = NULL WHERE id = ?", JSON.stringify(prefs), county || null, name || null, existing.id);
  else run('INSERT INTO subscribers (email, name, prefs, county, token, source) VALUES (?, ?, ?, ?, ?, ?)', email, name || null, JSON.stringify(prefs), county || null, token, source || null);
  const msg = templates.confirmSubscription({ token });
  sendMail({ to: email, ...msg, kind: 'bekrafta' });
  return { status: 'pending' };
}

export function registerPublic(r) {
  r.get('/api/public/bootstrap', (req, res) => json(res, 200, bootstrap()));

  r.get('/api/public/debates/:slug', (req, res, { params }) => {
    const d = get('SELECT * FROM debates WHERE slug = ? AND status != ?', params.slug, 'draft');
    if (!d) throw new HttpError(404, 'Debatten finns inte.');
    json(res, 200, { ...debateOut(d), open: isOpen(d) });
  });

  r.post('/api/public/applications', async (req, res) => {
    rateLimit(req, 'apply', 6, 10 * 60_000);
    const b = await readJson(req, 4_000_000);
    if (b.hp) return json(res, 200, { ok: true, ref: 'S3-OK' }); // honungsfälla för botar
    if (Number(b.t) > 0 && Number(b.t) < 4000) throw new HttpError(400, 'Formuläret skickades för snabbt. Försök igen.');

    const debate = b.debate ? get('SELECT * FROM debates WHERE slug = ?', str(b.debate, 120)) : null;
    if (b.debate && !debate) throw new HttpError(404, 'Debatten finns inte.');
    if (debate && !isOpen(debate)) throw new HttpError(409, 'Ansökan till den här debatten har stängt.');
    const kind = b.kind === 'publik' && debate?.audience_seats > 0 ? 'publik' : 'deltagare';

    const a = {
      name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40),
      birth_year: int(b.birth_year, 1900, new Date().getFullYear()), gender: str(b.gender, 40), municipality: str(b.municipality, 80),
      county: COUNTIES.includes(b.county) ? b.county : '', occupation: str(b.occupation, 120),
      party: PARTY_IDS.has(b.party) ? b.party : (kind === 'publik' ? 'EJ' : ''), party_member: b.party_member ? 1 : 0,
      office: str(b.office, 40), office_detail: str(b.office_detail, 200), organisations: str(b.organisations, 400),
      econ: b.econ === '' || b.econ == null ? null : int(b.econ, -10, 10), social: b.social === '' || b.social == null ? null : int(b.social, -10, 10),
      stance: b.stance === '' || b.stance == null ? null : int(b.stance, -2, 2), need_label: str(b.need_label, 120),
      motivation: str(b.motivation, 3000), argument: str(b.argument, 1000), change_mind: str(b.change_mind, 1000),
      media_experience: !!b.media_experience, media_detail: str(b.media_detail, 500),
      socials: { instagram: str(b.socials?.instagram, 80), tiktok: str(b.socials?.tiktok, 80), x: str(b.socials?.x, 80) },
      followers: str(b.followers, 40), video_link: str(b.video_link, 300), availability: ['ja', 'kanske', 'nej'].includes(b.availability) ? b.availability : '',
      can_travel: !!b.can_travel, heard_from: str(b.heard_from, 80), answers: {},
    };
    const errors = {};
    if (a.name.length < 2) errors.name = 'Skriv ditt namn.';
    if (!EMAIL_RE.test(a.email)) errors.email = 'Ange en giltig e-postadress.';
    if (a.phone.replace(/\D/g, '').length < 7) errors.phone = 'Ange ett telefonnummer.';
    if (!a.birth_year || new Date().getFullYear() - a.birth_year < 18) errors.birth_year = 'Du måste ha fyllt 18 år.';
    if (!b.consent_age) errors.consent_age = 'Bekräfta att du är över 18 år.';
    if (!b.consent_media) errors.consent_media = 'Vi behöver ditt godkännande för filmning.';
    if (kind === 'deltagare') {
      if (!a.party) errors.party = 'Välj ett alternativ (du kan välja "Vill inte uppge").';
      if (!b.consent_political) errors.consent_political = 'Vi behöver ditt samtycke för att spara uppgifter om politisk åsikt.';
      if (a.motivation.length < 30) errors.motivation = 'Berätta lite mer (minst 30 tecken).';
      for (const q of debate ? parse(debate.questions, []) : []) {
        const val = str(b.answers?.[q.id], 2000);
        if (q.required && !val) errors[`q_${q.id}`] = 'Obligatorisk fråga.';
        a.answers[q.id] = { label: q.label, value: val };
      }
    }
    if (Object.keys(errors).length) throw new HttpError(422, 'Kontrollera de markerade fälten.', errors);

    const photo = kind === 'deltagare' ? savePhoto(b.photo) : null;
    a.photo = photo;
    const score = kind === 'publik' ? 0 : scoreApplication(a, debate);
    const data = { ...a };
    for (const k of ['name', 'email', 'phone', 'birth_year', 'gender', 'municipality', 'county', 'occupation', 'party', 'party_member', 'organisations', 'econ', 'social', 'stance', 'need_label', 'motivation', 'photo']) delete data[k];

    const app = tx(() => {
      const yy = String(new Date().getFullYear()).slice(2);
      const tmp = `TMP-${randomToken(6)}`;
      const { lastInsertRowid: id } = run(
        `INSERT INTO applications (ref, debate_id, kind, score, name, email, phone, birth_year, gender, municipality, county, occupation, party, party_member,
          office, organisations, econ, social, stance, need_label, motivation, data, photo, consent_political, consent_media, ip_hash, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tmp, debate?.id ?? null, kind, score, a.name, a.email, a.phone, a.birth_year, a.gender, a.municipality, a.county, a.occupation, a.party, a.party_member,
        a.office, a.organisations, a.econ, a.social, a.stance, a.need_label, a.motivation, JSON.stringify(data), photo,
        b.consent_political ? 1 : 0, b.consent_media ? 1 : 0, hashIp(req), str(b.utm, 80) || null
      );
      const ref = `S3-${yy}${String(id).padStart(4, '0')}`;
      run('UPDATE applications SET ref = ? WHERE id = ?', ref, id);
      run('INSERT INTO application_events (application_id, type, message) VALUES (?, ?, ?)', id, 'skapad', kind === 'publik' ? 'Publikanmälan via webben' : 'Ansökan via webben');
      return { id: Number(id), ref, name: a.name, email: a.email, party: a.party, municipality: a.municipality, score };
    });

    track('apply_submit');
    sendMail({ to: app.email, ...templates.applicationReceived(app, debate), kind: 'kvitto' });
    notifyAdmins(templates.newApplicationNotice(app, debate));
    if (b.newsletter) createSubscriber({ email: app.email, name: app.name, prefs: ['debatter', 'videor'], county: a.county, source: 'ansokan' });
    json(res, 201, { ok: true, ref: app.ref });
  });

  r.post('/api/public/subscribe', async (req, res) => {
    rateLimit(req, 'subscribe', 8, 10 * 60_000);
    const b = await readJson(req);
    if (b.hp) return json(res, 200, { ok: true });
    const email = str(b.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(422, 'Ange en giltig e-postadress.', { email: 'Ange en giltig e-postadress.' });
    const allowed = ['debatter', 'videor', 'event'];
    const prefs = Array.isArray(b.prefs) ? b.prefs.filter((p) => allowed.includes(p)) : allowed;
    const result = createSubscriber({ email, name: str(b.name, 120), prefs: prefs.length ? prefs : allowed, county: COUNTIES.includes(b.county) ? b.county : null, source: str(b.source, 40) || 'webb' });
    track('subscribe');
    json(res, 200, { ok: true, ...result });
  });

  r.get('/nyhetsbrev/bekrafta', (req, res, { query }) => {
    const sub = get('SELECT * FROM subscribers WHERE token = ?', str(query.get('token'), 100));
    if (!sub) return redirect(res, '/?nyhetsbrev=ogiltig#nyhetsbrev');
    run("UPDATE subscribers SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, datetime('now')) WHERE id = ?", sub.id);
    redirect(res, '/?nyhetsbrev=bekraftad#nyhetsbrev');
  });

  r.get('/nyhetsbrev/avsluta', (req, res, { query }) => {
    const sub = get('SELECT * FROM subscribers WHERE token = ?', str(query.get('token'), 100));
    if (sub) run("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now') WHERE id = ?", sub.id);
    redirect(res, '/?nyhetsbrev=avslutad#nyhetsbrev');
  });

  r.post('/api/public/leads', async (req, res) => {
    rateLimit(req, 'leads', 5, 10 * 60_000);
    const b = await readJson(req);
    if (b.hp) return json(res, 200, { ok: true });
    const lead = {
      type: ['sponsring', 'livedebatt', 'forelasning', 'press', 'annat'].includes(b.type) ? b.type : 'annat',
      organisation: str(b.organisation, 160), name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40),
      budget: str(b.budget, 60), date_wish: str(b.date_wish, 60), message: str(b.message, 3000),
    };
    const errors = {};
    if (lead.name.length < 2) errors.name = 'Skriv ditt namn.';
    if (!EMAIL_RE.test(lead.email)) errors.email = 'Ange en giltig e-postadress.';
    if (lead.message.length < 10) errors.message = 'Berätta kort vad ni har i tankarna.';
    if (Object.keys(errors).length) throw new HttpError(422, 'Kontrollera de markerade fälten.', errors);
    run('INSERT INTO leads (type, organisation, name, email, phone, budget, date_wish, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      lead.type, lead.organisation, lead.name, lead.email, lead.phone, lead.budget, lead.date_wish, lead.message);
    track('lead');
    sendMail({ to: lead.email, ...templates.leadReceived(lead), kind: 'kvitto' });
    notifyAdmins({ subject: `Ny förfrågan (${lead.type}): ${lead.organisation || lead.name}`, kind: 'notis', html: `<p>${escapeHtml(lead.name)} &lt;${escapeHtml(lead.email)}&gt;${lead.organisation ? ` · ${escapeHtml(lead.organisation)}` : ''}</p><p>${escapeHtml(lead.message)}</p>` });
    json(res, 201, { ok: true });
  });

  const EVENTS = new Set(['view_home', 'view_apply', 'apply_start', 'apply_step_2', 'apply_step_3', 'apply_step_4', 'video_click', 'hero_complete', 'share']);
  r.post('/api/public/track', async (req, res) => {
    rateLimit(req, 'track', 120, 60_000);
    const b = await readJson(req, 2000);
    if (EVENTS.has(b.event)) track(b.event);
    send(res, 204, '');
  });
}
