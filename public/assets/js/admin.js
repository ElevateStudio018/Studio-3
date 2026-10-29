// STUDIO 3 admin – en liten app utan ramverk. Routing via #/sökväg.
import { THEMES } from './themes.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = new Intl.NumberFormat('sv-SE');
const num = (n) => nf.format(n || 0);
const dt = (s, withTime = true) => {
  if (!s) return '–';
  const d = new Date(s.includes('T') || s.includes('Z') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d) ? s : d.toLocaleString('sv-SE', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
const app = $('#app');
let ME = null;
let META = null;

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'X-Requested-With': 'studio3', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.endsWith('/login')) {
    ME = null;
    renderLogin();
    throw new Error('Inte inloggad');
  }
  if (!r.ok) {
    const e = new Error(data.error || 'Något gick fel');
    e.fields = data.fields || {};
    throw e;
  }
  return data;
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('is-on'), 3200);
}

// Tooltips för diagram och ikoner: element med data-tip
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-tip]');
  const tip = $('#tooltip');
  if (!el) return (tip.hidden = true);
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
});
document.addEventListener('pointermove', (e) => {
  const tip = $('#tooltip');
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${e.clientY + 16}px`;
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) return;
  const tip = $('#tooltip');
  const r = el.getBoundingClientRect();
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  tip.style.left = `${r.left}px`;
  tip.style.top = `${r.bottom + 6}px`;
});
document.addEventListener('focusout', () => ($('#tooltip').hidden = true));

const statusName = (id) => META.appStatuses.find((s) => s.id === id)?.name || id;
const debateStatusName = (id) => META.debateStatuses.find((s) => s.id === id)?.name || id;
const partyBadge = (p) => (p ? `<span class="party party--${esc(p)}" data-tip="${esc(META.parties.find((x) => x.id === p)?.name || p)}">${esc(p === 'OSAKER' ? '?' : p === 'EJ' ? '–' : p === 'ANNAT' ? 'Ann' : p)}</span>` : '<span class="muted">–</span>');
const compassMini = (a) => (a.econ == null || a.social == null ? '<span class="muted">–</span>' : `<span class="compass-mini" data-tip="Ekonomi ${a.econ}, GAL–TAN ${a.social}"><i style="left:${((a.econ + 10) / 20) * 100}%;top:${((a.social + 10) / 20) * 100}%"></i></span>`);
const stars = (n, id) => `<span class="stars" data-rate="${id}">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="${i <= n ? 'on' : ''}" data-v="${i}" aria-label="${i} stjärnor">★</button>`).join('')}</span>`;
const scoreBar = (s) => `<span class="score" data-tip="Matchningspoäng ${s}/100 – hjälp för sortering, inte ett beslut"><span class="score__bar"><i style="width:${s}%"></i></span><b>${s}</b></span>`;
const stanceText = (s) => ({ '-2': 'Helt emot', '-1': 'Delvis emot', 0: 'Vet inte', 1: 'Delvis för', 2: 'Helt för' })[s] ?? '–';

/* ---------- inloggning ---------- */
function renderLogin() {
  app.innerHTML = `<div class="login"><form id="loginForm" novalidate>
    <svg viewBox="0 0 1025 452" aria-hidden="true"><use href="#s3logo"/></svg>
    <h1 class="h-display" style="font-size:1.6rem">Admin</h1>
    <div class="f"><label for="le">E-post</label><input id="le" name="email" type="email" autocomplete="username" required></div>
    <div class="f"><label for="lp">Lösenord</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
    <p class="err" id="loginErr" role="alert"></p>
    <button class="btn" type="submit">Logga in</button>
    <a class="muted" href="/" style="font-size:.85rem">← Till sajten</a>
  </form></div>`;
  $('#le').focus();
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/login', { method: 'POST', body: { email: $('#le').value, password: $('#lp').value } });
      await boot();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    }
  });
}

/* ---------- skal ---------- */
const NAV = [
  ['', 'Översikt', '◎'], ['debatter', 'Debatter', '▤'], ['ansokningar', 'Ansökningar', '✎'], ['casting', 'Casting-tavla', '▦'],
  ['nyhetsbrev', 'Nyhetsbrev', '✉'], ['videor', 'Videor', '▶'], ['forfragningar', 'Förfrågningar', '€'], 'sep',
  ['innehall', 'Innehåll & stil', '✦'], ['utkorg', 'Utkorg', '⇪'], ['installningar', 'Inställningar', '⚙'],
];
let unread = 0;
function shell(title, actions = '') {
  const route = location.hash.replace(/^#\/?/, '').split('/')[0];
  app.innerHTML = `<div class="app-shell">
    <aside class="side" aria-label="Adminmeny">
      <a class="side__brand" href="#/"><svg viewBox="0 0 1025 452" aria-hidden="true"><use href="#s3logo"/></svg><span>Admin</span></a>
      ${NAV.map((n) => (n === 'sep' ? '<div class="side__sep"></div>' : `<a class="nav-item" href="#/${n[0]}" ${route === n[0] ? 'aria-current="page"' : ''}><span aria-hidden="true">${n[2]}</span>${n[1]}${n[0] === 'ansokningar' && unread ? `<span class="count">${unread}</span>` : ''}</a>`)).join('')}
      <div class="side__foot"><span>${esc(ME.email)}</span><a href="/" target="_blank">Visa sajten ↗</a><button class="btn btn--ghost btn--sm" id="logout" type="button">Logga ut</button></div>
    </aside>
    <div class="main">
      <div class="topbar"><button class="menu-toggle" id="menuToggle" type="button" aria-label="Meny">☰</button><h1 class="h-display">${esc(title)}</h1><div class="spacer"></div>${actions}</div>
      <div class="content" id="content"></div>
    </div>
  </div>`;
  $('#logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    renderLogin();
  });
  $('#menuToggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $$('.side a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
  return $('#content');
}

/* ---------- diagram ---------- */
function barChart(series, { height = 170 } = {}) {
  const max = Math.max(1, ...series.map((d) => d.n));
  const W = 600;
  const pad = { l: 26, b: 22, t: 8 };
  const bw = (W - pad.l) / series.length;
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.ceil(max / 2), max];
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Ansökningar per dag">
    ${ticks.map((t) => `<line class="grid-line" x1="${pad.l}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    ${series.map((d, i) => {
      const x = pad.l + i * bw;
      const h = height - pad.b - y(d.n);
      const label = `${new Date(d.day).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}: ${d.n} ansökningar`;
      return `<g><rect class="hit" x="${x}" y="${pad.t}" width="${bw}" height="${height - pad.t - pad.b}" data-tip="${label}"/>${d.n ? `<path class="bar" d="M${x + 2},${height - pad.b} v${-(h - 3)} q0,-3 3,-3 h${bw - 10} q3,0 3,3 v${h - 3} z" data-tip="${label}"/>` : ''}</g>`;
    }).join('')}
    ${series.map((d, i) => ((series.length - 1 - i) % 7 === 0 ? `<text class="axis-label" x="${pad.l + i * bw + bw / 2}" y="${height - 6}" text-anchor="middle">${new Date(d.day).toLocaleDateString('sv-SE', { day: 'numeric', month: 'numeric' })}</text>` : '')).join('')}
  </svg></div>`;
}
function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="hbars">${rows.map((r) => `<div class="hbar" data-tip="${esc(r.tip || `${r.label}: ${num(r.value)}`)}"><span class="hbar__label">${r.badge || ''}<span>${esc(r.label)}</span></span><span class="hbar__track"><span class="hbar__fill" style="width:${(r.value / max) * 100}%;display:block"></span></span><span class="hbar__val">${r.display ?? num(r.value)}</span></div>`).join('')}</div>`;
}
function needMeters(needs) {
  if (!needs?.length) return '<p class="muted" style="margin:0">Inga målgrupper angivna.</p>';
  return `<div class="grid" style="gap:12px">${needs.map((n) => {
    const target = n.count || Math.max(n.applied, 1);
    return `<div class="meter" data-tip="${esc(n.label)}: ${n.applied} sökande, ${n.shortlisted} på shortlist eller längre, mål ${n.count || '–'}">
      <div class="meter__top"><span>${esc(n.label)}</span><span><b>${n.shortlisted}</b>/${n.count || '–'} valda · ${n.applied} sökt</span></div>
      <div class="meter__track"><span class="meter__applied" style="width:${Math.min(100, (n.applied / target) * 100)}%"></span><span class="meter__short" style="width:${Math.min(100, (n.shortlisted / target) * 100)}%"></span></div></div>`;
  }).join('')}<div class="legend"><span><i style="background:var(--a-accent)"></i>Valda (shortlist → bekräftad)</span><span><i style="background:rgba(241,148,79,.35)"></i>Sökande</span></div></div>`;
}
function compassPlot(points) {
  const SHORT = ['shortlist', 'intervju', 'uttagen', 'bekraftad'];
  const pts = points.filter((p) => p.econ != null && p.social != null);
  return `<div class="compass-plot" role="img" aria-label="Sökandes politiska placering">
    <span class="ax" style="top:6px;left:50%;transform:translateX(-50%)">GAL</span><span class="ax" style="bottom:6px;left:50%;transform:translateX(-50%)">TAN</span>
    <span class="ax" style="left:6px;top:50%;transform:translateY(-50%)">V</span><span class="ax" style="right:6px;top:50%;transform:translateY(-50%)">H</span>
    ${pts.map((p) => `<span class="pt ${SHORT.includes(p.status) ? 'on' : ''}" style="left:${((p.econ + 10) / 20) * 100}%;top:${((p.social + 10) / 20) * 100}%" data-tip="${esc(p.party || '–')} · ${statusName(p.status)}${p.stance != null ? ` · ${stanceText(p.stance)}` : ''}"></span>`).join('')}
  </div><div class="legend" style="margin-top:10px"><span><i style="background:var(--a-accent)"></i>Shortlist eller längre</span><span><i style="border:2px solid var(--a-accent)"></i>Övriga sökande</span><span>${pts.length} av ${points.length} har angett kompass</span></div>`;
}

/* ---------- översikt ---------- */
async function viewDashboard() {
  const c = shell('Översikt', '<a class="btn" href="#/debatter/ny">+ Ny debatt</a>');
  const d = await api('/api/admin/dashboard');
  unread = d.kpi.unread;
  const f = d.funnel;
  const funnel = [
    ['Besök startsidan', f.view_home], ['Öppnade ansökan', f.view_apply], ['Började fylla i', f.apply_start], ['Steg 2', f.apply_step_2],
    ['Steg 3', f.apply_step_3], ['Steg 4', f.apply_step_4], ['Skickade', f.apply_submit],
  ].map(([label, v]) => ({ label, value: v || 0 }));
  const conv = f.view_apply ? Math.round(((f.apply_submit || 0) / f.view_apply) * 100) : 0;
  const partyRows = d.parties.map((p) => ({ label: META.parties.find((x) => x.id === p.party)?.name || p.party, value: p.n, badge: partyBadge(p.party) }));
  c.innerHTML = `
    <div class="kpis">
      <a class="kpi" href="#/ansokningar"><span class="kpi__label">Ansökningar totalt</span><span class="kpi__value">${num(d.kpi.applications)}</span><span class="kpi__sub">+${num(d.kpi.applications7)} senaste 7 dagarna</span></a>
      <a class="kpi" href="#/ansokningar?status=ny"><span class="kpi__label">Ogranskade</span><span class="kpi__value">${num(d.kpi.unread)}</span><span class="kpi__sub">status ”Ny”</span></a>
      <a class="kpi" href="#/debatter"><span class="kpi__label">Öppna debatter</span><span class="kpi__value">${num(d.kpi.openDebates)}</span><span class="kpi__sub">söker deltagare nu</span></a>
      <a class="kpi" href="#/nyhetsbrev"><span class="kpi__label">Prenumeranter</span><span class="kpi__value">${num(d.kpi.subscribers)}</span><span class="kpi__sub">+${num(d.kpi.subscribersPending)} väntar på bekräftelse</span></a>
      <a class="kpi" href="#/forfragningar"><span class="kpi__label">Nya förfrågningar</span><span class="kpi__value">${num(d.kpi.leads)}</span><span class="kpi__sub">pipeline ${num(d.kpi.pipeline)} kr</span></a>
      <div class="kpi"><span class="kpi__label">YouTube</span><span class="kpi__value">${num(d.channel.subscribers)}</span><span class="kpi__sub">prenumeranter · ${d.youtube?.ok ? `synkad ${dt(d.youtube.at)}` : d.youtube ? 'synk misslyckades' : 'ej synkad än'}</span></div>
    </div>
    <div class="grid grid-2-1">
      <section class="panel"><h2>Ansökningar senaste 30 dagarna <small>${num(d.series.reduce((s, x) => s + x.n, 0))} st</small></h2>${barChart(d.series)}</section>
      <section class="panel"><h2>Partisympati bland sökande <small>alla debatter</small></h2>${partyRows.length ? hbars(partyRows) : '<p class="muted">Inga ansökningar än.</p>'}</section>
    </div>
    <div class="grid grid-2">
      <section class="panel"><h2>Konverteringstratt <small>30 dagar · ${conv}% av besökarna på ansökan skickar in</small></h2>${hbars(funnel)}</section>
      <section class="panel"><h2>Öppna debatter <a class="btn btn--ghost btn--sm" href="#/debatter">Alla</a></h2>
        ${d.open.length ? d.open.map((x) => `<div style="padding:12px 0;border-bottom:1px solid var(--a-line)">
          <div class="row row--between" style="margin-bottom:10px"><a href="#/debatter/${x.id}"><strong>${esc(x.title)}</strong></a><span class="row"><span class="chip">${x.applicants} sökande</span><a class="btn btn--ghost btn--sm" href="#/casting/${x.id}">Casting</a></span></div>
          ${needMeters(x.needsStatus)}</div>`).join('') : '<p class="muted">Inga öppna debatter. <a href="#/debatter/ny">Skapa en</a>.</p>'}
      </section>
    </div>
    <section class="panel"><h2>Senaste ansökningar <a class="btn btn--ghost btn--sm" href="#/ansokningar">Visa alla</a></h2>${appTable(d.latest, { compact: true })}</section>`;
  bindAppTable(c);
}

/* ---------- debatter ---------- */
async function viewDebates() {
  const c = shell('Debatter', '<a class="btn" href="#/debatter/ny">+ Ny debatt</a>');
  const list = await api('/api/admin/debates');
  c.innerHTML = list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Debatt</th><th>Status</th><th>Inspelning</th><th>Sista dag</th><th class="num">Sökande</th><th>Målgrupper</th><th></th></tr></thead><tbody>
    ${list.map((d) => {
      const need = d.needsStatus.reduce((a, n) => ({ c: a.c + (n.count || 0), s: a.s + n.shortlisted }), { c: 0, s: 0 });
      return `<tr><td class="name-cell"><a href="#/debatter/${d.id}"><strong>${esc(d.title)}</strong></a><small>${esc(d.formatName)}${d.featured ? ' · ★ Utvald' : ''}</small></td>
      <td><span class="st st--${d.status}">${esc(debateStatusName(d.status))}</span>${d.status === 'open' && !d.open ? ' <span class="chip">Deadline passerad</span>' : ''}</td>
      <td>${dt(d.event_at)}</td><td>${dt(d.deadline)}</td><td class="num">${d.applicants}</td>
      <td>${need.c ? `${need.s}/${need.c} valda` : '–'}</td>
      <td><div class="row row--end"><a class="btn btn--ghost btn--sm" href="#/casting/${d.id}">Casting</a><a class="btn btn--ghost btn--sm" href="/sok/${encodeURIComponent(d.slug)}" target="_blank">Visa ↗</a><button class="btn btn--ghost btn--sm" data-dup="${d.id}" type="button">Duplicera</button></div></td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="panel empty-state">Inga debatter än. <a href="#/debatter/ny">Skapa den första</a>.</div>';
  c.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dup]');
    if (!b) return;
    const r = await api(`/api/admin/debates/${b.dataset.dup}/duplicate`, { method: 'POST' });
    toast('Kopia skapad som utkast');
    location.hash = `#/debatter/${r.id}`;
  });
}

const TEMPLATES = {
  '1vs20': { title: '1 mot 20: ', format: '1vs20', spots: 20, summary: 'En känd profil möter tjugo personer med motsatt åsikt.', needs: [{ label: 'Motståndare', count: 20, stance: 'emot' }], questions: [{ id: 'fraga', label: 'Vilken fråga vill du ställa?', type: 'textarea', required: true }] },
  soffan: { title: 'Studio Soffan: ', format: 'soffan', spots: 6, summary: 'Sex personer, en soffa och ett ämne som delar Sverige.', needs: [{ label: 'För', count: 3, stance: 'for' }, { label: 'Emot', count: 3, stance: 'emot' }], questions: [] },
  duellen: { title: 'Duellen: ', format: 'duellen', spots: 2, summary: 'Två debattörer, ett bord, inga mellanhänder.', needs: [{ label: 'Debattör för', count: 1, stance: 'for' }, { label: 'Debattör emot', count: 1, stance: 'emot' }], questions: [{ id: 'erfarenhet', label: 'Vilken debatterfarenhet har du?', type: 'textarea', required: true }] },
  partiledare: { title: 'Partiledare vs 20 väljare', format: 'partiledare', spots: 20, summary: 'Vi söker 20 väljare från hela spektrumet som vill ställa en partiledare mot väggen.', needs: [{ label: 'Rödgröna väljare (S, V, MP, C)', count: 10, parties: ['S', 'V', 'MP', 'C'] }, { label: 'Tidöväljare (M, SD, KD, L)', count: 10, parties: ['M', 'SD', 'KD', 'L'] }], questions: [{ id: 'fraga', label: 'Vilken fråga skulle du ställa till partiledaren?', type: 'textarea', required: true }] },
  panelen: { title: 'Panelen: ', format: 'panelen', spots: 4, summary: 'Två mot två – lagdebatt mellan två läger.', needs: [{ label: 'Lag A', count: 2 }, { label: 'Lag B', count: 2 }], questions: [] },
  publik: { title: 'Publik till livedebatt', format: 'publik', spots: 0, audience_seats: 200, summary: 'Var med i publiken när vi sänder live.', needs: [], questions: [] },
};

async function viewDebateEdit(id) {
  const isNew = id === 'ny';
  const c = shell(isNew ? 'Ny debatt' : 'Redigera debatt', `<a class="btn btn--ghost" href="#/debatter">← Tillbaka</a>`);
  const [d, videos] = await Promise.all([isNew ? null : api(`/api/admin/debates/${id}`), api('/api/admin/videos')]);
  const val = d || { title: '', format: '1vs20', status: 'draft', needs: [], questions: [], featured: false, audience_seats: 0 };
  const fmtOpts = Object.entries(META.formats).map(([k, n]) => `<option value="${k}" ${val.format === k ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const covers = videos.items.filter((v) => !v.hidden).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 12);
  c.innerHTML = `
    ${isNew ? `<section class="panel"><h2>Börja från en mall <small>fyller i format, målgrupper och frågor</small></h2><div class="row">${Object.entries(TEMPLATES).map(([k]) => `<button class="btn btn--ghost btn--sm" type="button" data-tpl="${k}">${esc(META.formats[k] || k)}</button>`).join('')}</div></section>` : ''}
    <form id="debateForm" class="grid grid-2-1" novalidate>
      <div class="grid">
        <section class="panel grid">
          <div class="f"><label for="d-title">Titel</label><input id="d-title" name="title" type="text" value="${esc(val.title)}" required></div>
          <div class="cols">
            <div class="f"><label for="d-format">Format</label><select id="d-format" name="format">${fmtOpts}</select></div>
            <div class="f"><label for="d-slug">Webbadress <span class="hint">/sok/…</span></label><input id="d-slug" name="slug" type="text" value="${esc(val.slug || '')}" placeholder="skapas automatiskt"></div>
          </div>
          <div class="f"><label for="d-statement">Påstående att ta ställning till <span class="hint">(visas som skala i ansökan)</span></label><input id="d-statement" name="statement" type="text" value="${esc(val.statement || '')}" placeholder="t.ex. Sverige ska bygga ut kärnkraften kraftigt."></div>
          <div class="f"><label for="d-summary">Kort ingress <span class="hint">(syns på korten och när länken delas)</span></label><input id="d-summary" name="summary" type="text" value="${esc(val.summary || '')}"></div>
          <div class="f"><label for="d-desc">Beskrivning</label><textarea id="d-desc" name="description" rows="5">${esc(val.description || '')}</textarea></div>
          <div class="cols">
            <div class="f"><label for="d-event">Inspelning</label><input id="d-event" name="event_at" type="datetime-local" value="${esc(val.event_at || '')}"></div>
            <div class="f"><label for="d-deadline">Sista ansökningsdag</label><input id="d-deadline" name="deadline" type="datetime-local" value="${esc(val.deadline || '')}"></div>
            <div class="f"><label for="d-location">Plats</label><input id="d-location" name="location" type="text" value="${esc(val.location || '')}"></div>
          </div>
          <div class="cols">
            <div class="f"><label for="d-spots">Antal deltagare</label><input id="d-spots" name="spots" type="number" min="0" value="${val.spots ?? ''}"></div>
            <div class="f"><label for="d-aud">Publikplatser <span class="hint">(0 = ingen publik)</span></label><input id="d-aud" name="audience_seats" type="number" min="0" value="${val.audience_seats || 0}"></div>
            <div class="f"><label for="d-yt">YouTube-länk <span class="hint">(när avsnittet är ute)</span></label><input id="d-yt" name="youtube_url" type="url" value="${esc(val.youtube_url || '')}"></div>
          </div>
        </section>
        <section class="panel"><h2>Vi söker <small>målgrupper – används för urval och balans</small><button class="btn btn--ghost btn--sm" type="button" id="addNeed">+ Målgrupp</button></h2><div class="repeat" id="needs"></div></section>
        <section class="panel"><h2>Egna frågor i ansökan<button class="btn btn--ghost btn--sm" type="button" id="addQ">+ Fråga</button></h2><div class="repeat" id="questions"></div></section>
      </div>
      <div class="grid" style="align-content:start">
        <section class="panel grid">
          <div class="f"><label for="d-status">Status</label><select id="d-status" name="status">${META.debateStatuses.map((s) => `<option value="${s.id}" ${val.status === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
          <label class="chk"><input type="checkbox" name="featured" ${val.featured ? 'checked' : ''}> Utvald – visas stort på startsidan</label>
          <label class="chk"><input type="checkbox" name="notify"> Mejla prenumeranter (”nya debatter”) när den sparas som öppen</label>
          <div class="row"><button class="btn" type="submit">${isNew ? 'Skapa debatt' : 'Spara ändringar'}</button>${!isNew ? `<a class="btn btn--ghost" href="/sok/${encodeURIComponent(val.slug)}" target="_blank">Visa sidan ↗</a>` : ''}</div>
          <p class="err" id="formErr" role="alert"></p>
          ${!isNew ? '<button class="btn btn--danger btn--sm" type="button" id="delDebate" style="justify-self:start">Radera debatt</button>' : ''}
        </section>
        <section class="panel grid"><h2>Omslagsbild <small>valfri – annars formatets mest sedda avsnitt</small></h2>
          <input name="cover_url" type="url" value="${esc(val.cover_url || '')}" placeholder="https://…" aria-label="Omslagsbild-URL">
          <div class="row">${covers.map((v) => `<button type="button" class="btn btn--ghost btn--sm" style="padding:0;overflow:hidden;border-radius:6px" data-cover="https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg" data-tip="${esc(v.display)}"><img class="thumb-sm" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt=""></button>`).join('')}</div>
        </section>
        ${!isNew ? `<section class="panel"><h2>Balans bland sökande <a class="btn btn--ghost btn--sm" href="#/casting/${val.id}">Casting →</a></h2>${needMeters(val.needsStatus)}<div style="height:16px"></div>${compassPlot(val.compass)}</section>` : ''}
      </div>
    </form>`;
  const form = $('#debateForm');
  const needRow = (n = {}) => `<div class="repeat__row" style="grid-template-columns:2fr 80px 1.5fr 120px auto">
    <div class="f"><span class="lbl">Grupp</span><input type="text" data-k="label" value="${esc(n.label || '')}" placeholder="t.ex. Sverigedemokrater"></div>
    <div class="f"><span class="lbl">Antal</span><input type="number" min="0" data-k="count" value="${n.count ?? ''}"></div>
    <div class="f"><span class="lbl">Partier <span class="hint">(valfritt)</span></span><input type="text" data-k="parties" value="${esc((n.parties || []).join(', '))}" placeholder="S, V, MP"></div>
    <div class="f"><span class="lbl">Ståndpunkt</span><select data-k="stance"><option value="">Valfri</option><option value="for" ${n.stance === 'for' ? 'selected' : ''}>För</option><option value="emot" ${n.stance === 'emot' ? 'selected' : ''}>Emot</option><option value="neutral" ${n.stance === 'neutral' ? 'selected' : ''}>Neutral</option></select></div>
    <button class="btn btn--ghost btn--sm" type="button" data-remove aria-label="Ta bort">✕</button></div>`;
  const qRow = (q = {}) => `<div class="repeat__row" style="grid-template-columns:2fr 130px 1.4fr auto auto">
    <div class="f"><span class="lbl">Fråga</span><input type="text" data-k="label" value="${esc(q.label || '')}"><input type="hidden" data-k="id" value="${esc(q.id || '')}"></div>
    <div class="f"><span class="lbl">Typ</span><select data-k="type">${[['text', 'Kort text'], ['textarea', 'Lång text'], ['select', 'Lista'], ['yesno', 'Ja/Nej']].map(([k, n]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="f"><span class="lbl">Alternativ <span class="hint">(för lista, kommaseparerat)</span></span><input type="text" data-k="options" value="${esc((q.options || []).join(', '))}"></div>
    <label class="chk"><input type="checkbox" data-k="required" ${q.required ? 'checked' : ''}> Krävs</label>
    <button class="btn btn--ghost btn--sm" type="button" data-remove aria-label="Ta bort">✕</button></div>`;
  const fill = (v) => {
    $('#needs').innerHTML = (v.needs || []).map(needRow).join('');
    $('#questions').innerHTML = (v.questions || []).map(qRow).join('');
  };
  fill(val);
  $('#addNeed').addEventListener('click', () => $('#needs').insertAdjacentHTML('beforeend', needRow()));
  $('#addQ').addEventListener('click', () => $('#questions').insertAdjacentHTML('beforeend', qRow()));
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove]')) e.target.closest('.repeat__row').remove();
    const cov = e.target.closest('[data-cover]');
    if (cov) form.cover_url.value = cov.dataset.cover;
  });
  c.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tpl]');
    if (!t) return;
    const tpl = TEMPLATES[t.dataset.tpl];
    for (const k of ['title', 'summary', 'spots', 'audience_seats']) if (tpl[k] != null && form[k]) form[k].value = tpl[k];
    form.format.value = tpl.format;
    fill(tpl);
    form.title.focus();
    toast('Mallen är ifylld – anpassa och spara.');
  });
  $('#delDebate')?.addEventListener('click', async () => {
    if (!confirm('Radera debatten? Ansökningarna flyttas till talangbanken.')) return;
    await api(`/api/admin/debates/${id}`, { method: 'DELETE' });
    toast('Debatten är raderad');
    location.hash = '#/debatter';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(['title', 'slug', 'format', 'statement', 'summary', 'description', 'event_at', 'deadline', 'location', 'spots', 'audience_seats', 'youtube_url', 'status', 'cover_url'].map((k) => [k, form[k].value]));
    body.featured = form.featured.checked;
    body.notify = form.notify.checked;
    body.needs = $$('#needs .repeat__row').map((r) => ({
      label: $('[data-k="label"]', r).value, count: $('[data-k="count"]', r).value,
      parties: $('[data-k="parties"]', r).value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean), stance: $('[data-k="stance"]', r).value,
    }));
    body.questions = $$('#questions .repeat__row').map((r, i) => ({
      id: $('[data-k="id"]', r).value || `q${Date.now().toString(36)}${i}`, label: $('[data-k="label"]', r).value, type: $('[data-k="type"]', r).value,
      options: $('[data-k="options"]', r).value.split(',').map((s) => s.trim()).filter(Boolean), required: $('[data-k="required"]', r).checked,
    }));
    try {
      const saved = await api(isNew ? '/api/admin/debates' : `/api/admin/debates/${id}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(saved.campaign ? `Sparad – mejl skickat till ${saved.campaign.recipients} prenumeranter` : 'Sparad');
      if (isNew) location.hash = `#/debatter/${saved.id}`;
      else viewDebateEdit(id);
    } catch (err) {
      $('#formErr').textContent = err.message;
    }
  });
}

/* ---------- ansökningar ---------- */
function appTable(items, { compact = false, selectable = false } = {}) {
  if (!items.length) return '<div class="empty-state">Inga ansökningar matchar.</div>';
  return `<div class="table-wrap"><table class="t"><thead><tr>
    ${selectable ? '<th><input type="checkbox" id="selAll" aria-label="Markera alla"></th>' : ''}
    <th>Namn</th><th>Ålder</th><th>Ort</th><th>Parti</th>${compact ? '' : '<th>Kompass</th>'}<th>Debatt / grupp</th>${compact ? '' : '<th>Matchning</th><th>Betyg</th>'}<th>Status</th><th>Inkom</th></tr></thead><tbody>
    ${items.map((a) => `<tr class="clickable" data-app="${a.id}">
      ${selectable ? `<td><input type="checkbox" data-sel="${a.id}" aria-label="Markera ${esc(a.name)}"></td>` : ''}
      <td class="name-cell"><strong>${esc(a.name)}${a.has_photo ? ' 📷' : ''}</strong><small>${esc(a.ref)}${a.kind === 'publik' ? ' · publik' : ''}</small>${a.duplicates ? `<span class="dupe" data-tip="Samma e-post eller telefon finns i ${a.duplicates} andra ansökningar"> · sökt ${a.duplicates + 1} ggr</span>` : ''}</td>
      <td>${a.age ?? '–'}</td><td>${esc(a.municipality || '–')}</td><td>${partyBadge(a.party)}${a.party_member ? ' <span class="chip" data-tip="Partimedlem">M</span>' : ''}${a.office ? ' <span class="chip chip--accent" data-tip="Har politiskt uppdrag">Uppdrag</span>' : ''}</td>
      ${compact ? '' : `<td>${compassMini(a)}</td>`}
      <td class="name-cell"><span>${esc(a.debate_title || 'Talangbanken')}</span><small>${esc(a.need_label || '')}</small></td>
      ${compact ? '' : `<td>${a.kind === 'publik' ? '–' : scoreBar(a.score)}</td><td>${stars(a.rating, a.id)}</td>`}
      <td><span class="st st--${a.status}">${esc(statusName(a.status))}</span></td><td>${dt(a.created_at)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function bindAppTable(root, onChange) {
  root.addEventListener('click', async (e) => {
    const star = e.target.closest('.stars button');
    if (star) {
      e.stopPropagation();
      const id = star.closest('[data-rate]').dataset.rate;
      await api(`/api/admin/applications/${id}`, { method: 'PATCH', body: { rating: Number(star.dataset.v) } });
      $$('button', star.parentElement).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= Number(star.dataset.v)));
      return;
    }
    if (e.target.closest('input[type="checkbox"]')) return;
    const row = e.target.closest('[data-app]');
    if (row) openApplication(row.dataset.app, onChange);
  });
}

const appFilters = { debate: '', status: '', party: '', county: '', minAge: '', maxAge: '', q: '', sort: '', kind: '' };
async function viewApplications(params) {
  for (const [k, v] of params) if (k in appFilters) appFilters[k] = v;
  const c = shell('Ansökningar', `<a class="btn btn--ghost" id="exportBtn" href="#">Exportera CSV</a>`);
  const debates = await api('/api/admin/debates');
  const sel = (name, opts, label) => `<div class="f"><label for="af-${name}">${label}</label><select id="af-${name}" data-filter="${name}"><option value="">Alla</option>${opts.map(([v, n]) => `<option value="${esc(v)}" ${appFilters[name] === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
  c.innerHTML = `
    <div class="panel filters">
      <div class="f f--wide"><label for="af-q">Sök</label><input id="af-q" data-filter="q" type="search" value="${esc(appFilters.q)}" placeholder="Namn, e-post, ort, ref, motivering…"></div>
      ${sel('debate', [['talangbank', 'Talangbanken'], ...debates.map((d) => [d.id, d.title])], 'Debatt')}
      ${sel('party', META.parties.map((p) => [p.id, p.name]), 'Parti')}
      ${sel('county', META.counties.map((x) => [x, x]), 'Län')}
      ${sel('kind', [['deltagare', 'Deltagare'], ['publik', 'Publik']], 'Typ')}
      <div class="f" style="max-width:100px"><label for="af-min">Ålder från</label><input id="af-min" data-filter="minAge" type="number" value="${esc(appFilters.minAge)}"></div>
      <div class="f" style="max-width:100px"><label for="af-max">till</label><input id="af-max" data-filter="maxAge" type="number" value="${esc(appFilters.maxAge)}"></div>
      <div class="f"><label for="af-sort">Sortera</label><select id="af-sort" data-filter="sort">${[['', 'Senaste först'], ['score', 'Högst matchning'], ['rating', 'Högst betyg'], ['name', 'Namn A–Ö'], ['old', 'Äldsta först']].map(([v, n]) => `<option value="${v}" ${appFilters.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <div class="status-tabs" id="statusTabs"></div>
    <div class="bulk" id="bulk" hidden>
      <strong id="bulkCount"></strong>
      <select id="bulkStatus" aria-label="Ny status"><option value="">Sätt status…</option>${META.appStatuses.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <button class="btn btn--ghost btn--sm" type="button" data-bulk="tag">Tagga…</button>
      <button class="btn btn--ghost btn--sm" type="button" data-bulk="invite">Skicka inbjudan</button>
      <button class="btn btn--ghost btn--sm" type="button" data-bulk="reject">Skicka ”nej tack”</button>
      <button class="btn btn--danger btn--sm" type="button" data-bulk="delete">Radera</button>
    </div>
    <div id="appList"></div>`;
  const load = async () => {
    const qs = new URLSearchParams(Object.entries(appFilters).filter(([, v]) => v));
    $('#exportBtn').href = `/api/admin/export/applications.csv?${qs}`;
    const r = await api(`/api/admin/applications?${qs}`);
    const all = Object.values(r.counts).reduce((a, b) => a + b, 0);
    $('#statusTabs').innerHTML = [`<button type="button" data-st="" aria-pressed="${!appFilters.status}">Alla<b>${appFilters.status ? '' : r.total}</b></button>`,
      ...META.appStatuses.map((s) => `<button type="button" data-st="${s.id}" aria-pressed="${appFilters.status === s.id}">${esc(s.name)}<b>${r.counts[s.id] || (appFilters.status === s.id ? r.total : '') || ''}</b></button>`)].join('');
    $('#appList').innerHTML = `<p class="muted" style="margin:0 0 8px">${num(r.total)} ansökningar${all > r.items.length ? ` (visar ${r.items.length})` : ''}</p>${appTable(r.items, { selectable: true })}`;
    updateBulk();
  };
  const updateBulk = () => {
    const ids = $$('[data-sel]:checked').map((x) => Number(x.dataset.sel));
    $('#bulk').hidden = !ids.length;
    $('#bulkCount').textContent = `${ids.length} markerade`;
    return ids;
  };
  let t;
  c.addEventListener('input', (e) => {
    const f = e.target.dataset.filter;
    if (!f) return;
    appFilters[f] = e.target.value;
    clearTimeout(t);
    t = setTimeout(load, e.target.type === 'search' ? 250 : 0);
  });
  c.addEventListener('click', (e) => {
    const st = e.target.closest('[data-st]');
    if (st) ((appFilters.status = st.dataset.st), load());
  });
  c.addEventListener('change', async (e) => {
    if (e.target.id === 'selAll') $$('[data-sel]').forEach((x) => (x.checked = e.target.checked));
    if (e.target.matches('[data-sel], #selAll')) updateBulk();
    if (e.target.id === 'bulkStatus' && e.target.value) {
      await api('/api/admin/applications/bulk', { method: 'POST', body: { ids: updateBulk(), action: 'status', status: e.target.value } });
      toast('Status uppdaterad');
      load();
    }
  });
  $('#bulk').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bulk]');
    if (!b) return;
    const ids = updateBulk();
    const a = b.dataset.bulk;
    if (a === 'tag') {
      const tag = prompt('Tagg att lägga till (t.ex. "stark röst", "ring tillbaka"):');
      if (!tag) return;
      await api('/api/admin/applications/bulk', { method: 'POST', body: { ids, action: 'tag', tag } });
    } else if (a === 'invite' || a === 'reject') {
      const msg = a === 'invite' ? prompt('Personligt meddelande i inbjudan (valfritt):', '') : '';
      if (msg === null || !confirm(`Skicka ${a === 'invite' ? 'inbjudan' : '”nej tack”'} till ${ids.length} personer?`)) return;
      await api('/api/admin/applications/bulk', { method: 'POST', body: { ids, action: 'email', template: a, message: msg } });
    } else if (a === 'delete') {
      if (!confirm(`Radera ${ids.length} ansökningar permanent? (GDPR)`)) return;
      await api('/api/admin/applications/bulk', { method: 'POST', body: { ids, action: 'delete' } });
    }
    toast('Klart');
    load();
  });
  bindAppTable(c, load);
  await load();
  const deep = location.hash.match(/ansokningar\/(\d+)/);
  if (deep) openApplication(deep[1], load);
}

async function openApplication(id, onChange) {
  const a = await api(`/api/admin/applications/${id}`);
  const debates = await api('/api/admin/debates');
  $('.drawer-bg')?.remove();
  $('.drawer')?.remove();
  const data = a.data || {};
  const socials = Object.entries(data.socials || {}).filter(([, v]) => v);
  const answers = Object.values(data.answers || {});
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  const dr = document.createElement('aside');
  dr.className = 'drawer';
  dr.setAttribute('aria-label', `Ansökan från ${a.name}`);
  const officeNames = { kommun: 'Kommun', region: 'Region', riksdag: 'Riksdag', eu: 'EU-parlamentet', parti: 'Inom partiet', tidigare: 'Tidigare uppdrag' };
  dr.innerHTML = `
    <div class="drawer__head">
      ${a.has_photo ? `<img class="drawer__photo" src="/api/admin/applications/${a.id}/photo" alt="Bild på ${esc(a.name)}">` : `<div class="drawer__photo">${esc(a.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</div>`}
      <div style="flex:1;min-width:0"><h2 class="h-display" style="font-size:1.4rem">${esc(a.name)}</h2><div class="muted" style="font-size:.85rem">${esc(a.ref)} · ${esc(a.debate_title || 'Talangbanken')}${a.need_label ? ` · ${esc(a.need_label)}` : ''} · inkom ${dt(a.created_at)}</div></div>
      <button class="btn btn--ghost btn--sm" type="button" data-close aria-label="Stäng">✕</button>
    </div>
    <div class="drawer__body">
      <div class="pipeline" role="group" aria-label="Status">${META.appStatuses.map((s) => `<button type="button" data-status="${s.id}" aria-pressed="${a.status === s.id}">${esc(s.name)}</button>`).join('')}</div>
      <div class="row row--between">
        <span class="row">${stars(a.rating, a.id)}${a.kind !== 'publik' ? scoreBar(a.score) : '<span class="chip">Publik</span>'}</span>
        <span class="row"><a class="btn btn--ghost btn--sm" href="mailto:${esc(a.email)}">✉ ${esc(a.email)}</a>${a.phone ? `<a class="btn btn--ghost btn--sm" href="tel:${esc(a.phone)}">☎ ${esc(a.phone)}</a>` : ''}</span>
      </div>
      ${a.duplicates ? `<div class="notice">Samma person har sökt ${a.duplicates} gång(er) till: ${a.other.map((o) => `<a href="#/ansokningar/${o.id}" data-open="${o.id}">${esc(o.debate_title || 'Talangbanken')} (${esc(statusName(o.status))})</a>`).join(', ')}</div>` : ''}
      <section class="panel"><h2>Om</h2><dl class="kv">
        <dt>Ålder</dt><dd>${a.age ?? '–'} år (född ${a.birth_year ?? '–'})</dd><dt>Kön</dt><dd>${esc(a.gender || '–')}</dd>
        <dt>Bor</dt><dd>${esc([a.municipality, a.county].filter(Boolean).join(', ') || '–')}</dd><dt>Sysselsättning</dt><dd>${esc(a.occupation || '–')}</dd>
        <dt>Hittade hit via</dt><dd>${esc(data.heard_from || '–')}</dd>${data.availability ? `<dt>Kan delta</dt><dd>${esc({ ja: 'Ja', kanske: 'Kanske', nej: 'Nej' }[data.availability])}${data.can_travel ? ' · kan resa själv' : ''}</dd>` : ''}
      </dl></section>
      ${a.kind !== 'publik' ? `<section class="panel"><h2>Politik</h2><div class="grid grid-2" style="align-items:start"><dl class="kv" style="grid-template-columns:130px 1fr">
        <dt>Parti</dt><dd>${partyBadge(a.party)} ${esc(META.parties.find((p) => p.id === a.party)?.name || '')}</dd>
        <dt>Medlem</dt><dd>${a.party_member ? 'Ja' : 'Nej'}</dd><dt>Uppdrag</dt><dd>${a.office ? `${esc(officeNames[a.office] || a.office)}${data.office_detail ? ` – ${esc(data.office_detail)}` : ''}` : 'Nej'}</dd>
        <dt>Organisationer</dt><dd>${esc(a.organisations || '–')}</dd><dt>Ståndpunkt</dt><dd>${stanceText(a.stance)}</dd>
      </dl>${a.econ != null ? compassPlot([{ econ: a.econ, social: a.social, status: 'shortlist', party: a.party }]).replace('<div class="legend"', '<div hidden class="legend"') : '<p class="muted">Ingen kompass angiven.</p>'}</div></section>
      <section class="panel"><h2>Din röst</h2><div class="grid">
        <div><div class="muted" style="font-size:.8rem;margin-bottom:4px">Varför just jag</div><div class="quote-box">${esc(a.motivation || '–')}</div></div>
        ${data.argument ? `<div><div class="muted" style="font-size:.8rem;margin-bottom:4px">Starkaste argument</div><div class="quote-box">${esc(data.argument)}</div></div>` : ''}
        ${data.change_mind ? `<div><div class="muted" style="font-size:.8rem;margin-bottom:4px">Kan ändra sig om</div><div class="quote-box">${esc(data.change_mind)}</div></div>` : ''}
        ${answers.map((q) => `<div><div class="muted" style="font-size:.8rem;margin-bottom:4px">${esc(q.label)}</div><div class="quote-box">${esc(q.value || '–')}</div></div>`).join('')}
        <dl class="kv"><dt>Medieerfarenhet</dt><dd>${data.media_experience ? `Ja${data.media_detail ? ` – ${esc(data.media_detail)}` : ''}` : 'Nej'}</dd>
        <dt>Sociala medier</dt><dd>${socials.length ? socials.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ') : '–'}${data.followers ? ` (${esc(data.followers)} följare)` : ''}</dd>
        <dt>Videolänk</dt><dd>${data.video_link && /^https?:\/\//.test(data.video_link) ? `<a href="${esc(data.video_link)}" target="_blank" rel="noopener noreferrer">${esc(data.video_link)}</a>` : '–'}</dd></dl>
      </div></section>` : ''}
      <section class="panel"><h2>Taggar & anteckningar</h2>
        <div class="tags" id="tags">${a.tags.map((t) => `<span class="chip">${esc(t)} <button type="button" data-untag="${esc(t)}" aria-label="Ta bort tagg">✕</button></span>`).join('')}<input type="text" id="newTag" placeholder="+ tagg" style="width:120px;min-height:30px"></div>
        <div class="f" style="margin-top:12px"><label for="notes">Interna anteckningar <span class="hint">(sparas automatiskt)</span></label><textarea id="notes">${esc(a.notes || '')}</textarea></div>
      </section>
      <section class="panel grid"><h2>Kontakta</h2>
        <div class="f"><label for="mailMsg">Personligt meddelande (används i inbjudan)</label><textarea id="mailMsg" rows="3" placeholder="t.ex. Vi ringer dig på torsdag för att stämma av."></textarea></div>
        <div class="row"><button class="btn btn--sm" type="button" data-mail="invite">Skicka inbjudan</button><button class="btn btn--ghost btn--sm" type="button" data-mail="reject">Skicka ”nej tack”</button></div>
      </section>
      <section class="panel"><h2>Flytta & radera</h2><div class="row">
        <select id="moveTo" aria-label="Flytta till debatt"><option value="">Talangbanken</option>${debates.map((d) => `<option value="${d.id}" ${a.debate_id === d.id ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</select>
        <button class="btn btn--ghost btn--sm" type="button" id="moveBtn">Flytta</button><span class="spacer" style="flex:1"></span>
        <button class="btn btn--danger btn--sm" type="button" id="delApp">Radera permanent (GDPR)</button></div>
        <p class="muted" style="font-size:.8rem;margin:10px 0 0">Samtycke politiska uppgifter: ${a.consent_political ? 'Ja' : 'Nej'} · filmning: ${a.consent_media ? 'Ja' : 'Nej'}</p>
      </section>
      <section class="panel"><h2>Historik</h2><div class="timeline">${a.events.map((e) => `<div><time>${dt(e.created_at)}</time><span>${esc(e.message || e.type)}${e.user_email ? ` · ${esc(e.user_email)}` : ''}</span></div>`).join('')}</div></section>
    </div>`;
  document.body.append(bg, dr);
  dr.querySelector('[data-close]').focus();
  const close = () => {
    bg.remove();
    dr.remove();
    document.removeEventListener('keydown', onKey);
    if (location.hash.match(/ansokningar\/\d+/)) history.replaceState(null, '', '#/ansokningar');
    onChange?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', close);
  const patch = (body) => api(`/api/admin/applications/${a.id}`, { method: 'PATCH', body });
  dr.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return close();
    const st = e.target.closest('[data-status]');
    if (st) {
      await patch({ status: st.dataset.status });
      $$('[data-status]', dr).forEach((b) => b.setAttribute('aria-pressed', b === st));
      toast(`Status: ${statusName(st.dataset.status)}`);
    }
    const star = e.target.closest('.stars button');
    if (star) {
      await patch({ rating: Number(star.dataset.v) });
      $$('.stars button', dr).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= Number(star.dataset.v)));
    }
    const un = e.target.closest('[data-untag]');
    if (un) {
      a.tags = a.tags.filter((t) => t !== un.dataset.untag);
      await patch({ tags: a.tags });
      un.closest('.chip').remove();
    }
    const m = e.target.closest('[data-mail]');
    if (m) {
      if (!confirm(m.dataset.mail === 'invite' ? `Skicka inbjudan till ${a.email}?` : `Skicka ”nej tack” till ${a.email}?`)) return;
      await api(`/api/admin/applications/${a.id}/email`, { method: 'POST', body: { template: m.dataset.mail, message: $('#mailMsg').value } });
      if (m.dataset.mail === 'invite' && !['uttagen', 'bekraftad'].includes(a.status)) await patch({ status: 'uttagen' });
      if (m.dataset.mail === 'reject') await patch({ status: 'nej' });
      toast('Mejlet är skickat');
      openApplication(a.id, onChange);
    }
    const op = e.target.closest('[data-open]');
    if (op) (e.preventDefault(), openApplication(op.dataset.open, onChange));
  });
  $('#newTag', dr).addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    e.preventDefault();
    a.tags.push(e.target.value.trim());
    await patch({ tags: a.tags });
    openApplication(a.id, onChange);
  });
  let nt;
  $('#notes', dr).addEventListener('input', (e) => {
    clearTimeout(nt);
    nt = setTimeout(() => patch({ notes: e.target.value }).then(() => toast('Anteckning sparad')), 700);
  });
  $('#moveBtn', dr).addEventListener('click', async () => {
    await patch({ debate_id: $('#moveTo', dr).value || null });
    toast('Flyttad');
    openApplication(a.id, onChange);
  });
  $('#delApp', dr).addEventListener('click', async () => {
    if (!confirm(`Radera ${a.name}s ansökan permanent? Det går inte att ångra.`)) return;
    await api(`/api/admin/applications/${a.id}`, { method: 'DELETE' });
    toast('Ansökan raderad');
    close();
  });
}

/* ---------- casting-tavla ---------- */
async function viewCasting(id) {
  const debates = await api('/api/admin/debates');
  const current = id || debates.find((d) => d.status === 'open')?.id || debates[0]?.id;
  const c = shell('Casting-tavla', `<select id="castSel" aria-label="Välj debatt" style="max-width:320px">${debates.map((d) => `<option value="${d.id}" ${d.id === Number(current) ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</select>`);
  $('#castSel').addEventListener('change', (e) => (location.hash = `#/casting/${e.target.value}`));
  if (!current) return (c.innerHTML = '<div class="panel empty-state">Skapa en debatt först.</div>');
  const [d, r] = await Promise.all([api(`/api/admin/debates/${current}`), api(`/api/admin/applications?debate=${current}&sort=score&kind=deltagare&limit=500`)]);
  const lanes = META.appStatuses;
  c.innerHTML = `
    <div class="grid grid-2-1">
      <section class="panel"><h2>${esc(d.title)} <small>${d.applicants} sökande · dra korten mellan kolumnerna</small></h2>${needMeters(d.needsStatus)}</section>
      <section class="panel"><h2>Politisk spridning</h2>${compassPlot(d.compass)}</section>
    </div>
    <div class="board" id="board">${lanes.map((l) => {
      const items = r.items.filter((a) => a.status === l.id);
      return `<div class="lane" data-lane="${l.id}"><div class="lane__head"><span class="st st--${l.id}">${esc(l.name)}</span><span class="chip">${items.length}</span></div>
        ${items.map((a) => `<div class="kcard" draggable="true" data-card="${a.id}" tabindex="0">
          <div class="kcard__top"><strong>${esc(a.name)}</strong>${partyBadge(a.party)}</div>
          <div class="muted">${a.age ?? '–'} år · ${esc(a.municipality || '–')}</div>
          ${a.need_label ? `<div><span class="chip">${esc(a.need_label)}</span></div>` : ''}
          <div class="kcard__top">${scoreBar(a.score)}${stars(a.rating, a.id)}</div></div>`).join('')}</div>`;
    }).join('')}</div>`;
  const board = $('#board');
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-card]');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.card);
    card.classList.add('is-dragging');
  });
  board.addEventListener('dragend', (e) => e.target.closest('[data-card]')?.classList.remove('is-dragging'));
  board.addEventListener('dragover', (e) => {
    const lane = e.target.closest('[data-lane]');
    if (!lane) return;
    e.preventDefault();
    $$('.lane', board).forEach((l) => l.classList.toggle('is-over', l === lane));
  });
  board.addEventListener('drop', async (e) => {
    const lane = e.target.closest('[data-lane]');
    if (!lane) return;
    e.preventDefault();
    const id2 = e.dataTransfer.getData('text/plain');
    await api(`/api/admin/applications/${id2}`, { method: 'PATCH', body: { status: lane.dataset.lane } });
    toast(`Flyttad till ${statusName(lane.dataset.lane)}`);
    viewCasting(current);
  });
  board.addEventListener('click', (e) => {
    if (e.target.closest('.stars')) return;
    const card = e.target.closest('[data-card]');
    if (card) openApplication(card.dataset.card, () => viewCasting(current));
  });
  board.addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-card]');
    if (card && e.key === 'Enter') openApplication(card.dataset.card, () => viewCasting(current));
  });
  bindAppTable($('#board'));
}

/* ---------- nyhetsbrev ---------- */
async function viewNewsletter() {
  const c = shell('Nyhetsbrev', '<a class="btn btn--ghost" href="/api/admin/export/subscribers.csv">Exportera CSV</a>');
  const [subs, camps] = await Promise.all([api('/api/admin/subscribers'), api('/api/admin/campaigns')]);
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span class="kpi__label">Bekräftade</span><span class="kpi__value">${num(subs.confirmed)}</span></div>
      <div class="kpi"><span class="kpi__label">Vill ha nya debatter</span><span class="kpi__value">${num(subs.segments.debatter)}</span></div>
      <div class="kpi"><span class="kpi__label">Vill ha nya avsnitt</span><span class="kpi__value">${num(subs.segments.videor)}</span></div>
      <div class="kpi"><span class="kpi__label">Vill ha event</span><span class="kpi__value">${num(subs.segments.event)}</span></div>
    </div>
    <div class="grid grid-2">
      <form class="panel grid" id="campForm" novalidate>
        <h2>Nytt utskick <button class="btn btn--ghost btn--sm" type="button" id="draftVideos">Fyll i från senaste videor</button></h2>
        <div class="f"><label for="c-subject">Ämnesrad</label><input id="c-subject" name="subject" type="text" required></div>
        <div class="f"><label for="c-body">Text <span class="hint">(tom rad = nytt stycke, länkar blir klickbara)</span></label><textarea id="c-body" name="body" rows="10"></textarea></div>
        <div class="cols">
          <div class="f"><label for="c-seg">Mottagare</label><select id="c-seg" name="segment"><option value="alla">Alla bekräftade</option><option value="debatter">Nya debatter</option><option value="videor">Nya avsnitt</option><option value="event">Event & publik</option></select></div>
          <div class="f"><label for="c-county">Län <span class="hint">(valfritt)</span></label><select id="c-county" name="county"><option value="">Hela Sverige</option>${META.counties.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
        </div>
        <div class="row"><button class="btn btn--ghost" type="button" id="testSend">Skicka test till mig</button><button class="btn" type="submit">Skicka utskick</button></div>
        <p class="err" id="campErr"></p>
      </form>
      <section class="panel"><h2>Tidigare utskick</h2>${camps.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Ämne</th><th>Segment</th><th class="num">Mottagare</th><th>Skickat</th></tr></thead><tbody>${camps.map((x) => `<tr><td>${esc(x.subject)}${x.auto ? ' <span class="chip">auto</span>' : ''}</td><td>${esc(x.segment)}</td><td class="num">${num(x.recipients)}</td><td>${dt(x.sent_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Inga utskick än.</p>'}</section>
    </div>
    <section class="panel"><h2>Prenumeranter <small>${num(subs.total)} st</small></h2>
      <div class="filters" style="margin-bottom:12px"><div class="f f--wide"><label for="s-q">Sök</label><input id="s-q" type="search" placeholder="E-post eller namn"></div>
        <div class="f"><label for="s-st">Status</label><select id="s-st"><option value="">Alla</option><option value="confirmed">Bekräftad</option><option value="pending">Väntar</option><option value="unsubscribed">Avregistrerad</option></select></div></div>
      <div id="subList"></div></section>`;
  const renderSubs = (items) => {
    $('#subList').innerHTML = items.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>E-post</th><th>Intressen</th><th>Län</th><th>Källa</th><th>Status</th><th>Skapad</th><th></th></tr></thead><tbody>${items.map((s) => `<tr><td>${esc(s.email)}${s.name ? `<br><small class="muted">${esc(s.name)}</small>` : ''}</td><td>${s.prefs.map((p) => `<span class="chip">${esc(p)}</span>`).join(' ')}</td><td>${esc(s.county || '–')}</td><td>${esc(s.source || '–')}</td><td><span class="st st--${s.status}">${esc({ confirmed: 'Bekräftad', pending: 'Väntar', unsubscribed: 'Avregistrerad' }[s.status] || s.status)}</span></td><td>${dt(s.created_at)}</td><td><button class="btn btn--ghost btn--sm" data-delsub="${s.id}" type="button" aria-label="Radera">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Inga prenumeranter än.</div>';
  };
  renderSubs(subs.items);
  const reload = async () => {
    const qs = new URLSearchParams({ q: $('#s-q').value, status: $('#s-st').value });
    renderSubs((await api(`/api/admin/subscribers?${qs}`)).items);
  };
  $('#s-q').addEventListener('input', reload);
  $('#s-st').addEventListener('change', reload);
  $('#subList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delsub]');
    if (b && confirm('Radera prenumeranten?')) (await api(`/api/admin/subscribers/${b.dataset.delsub}`, { method: 'DELETE' }), reload());
  });
  const form = $('#campForm');
  $('#draftVideos').addEventListener('click', async () => {
    const d = await api('/api/admin/campaigns/draft-videos');
    form.subject.value = d.subject;
    form.body.value = d.body;
    form.segment.value = 'videor';
  });
  const body = () => ({ subject: form.subject.value, body: form.body.value, segment: form.segment.value, county: form.county.value });
  $('#testSend').addEventListener('click', async () => {
    try {
      await api('/api/admin/campaigns', { method: 'POST', body: { ...body(), test: true } });
      toast(`Testmejl skickat till ${ME.email}`);
    } catch (err) {
      $('#campErr').textContent = err.message;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('Skicka utskicket nu?')) return;
    try {
      const r = await api('/api/admin/campaigns', { method: 'POST', body: body() });
      toast(`Skickat till ${r.recipients} prenumeranter`);
      viewNewsletter();
    } catch (err) {
      $('#campErr').textContent = err.message;
    }
  });
}

/* ---------- videor ---------- */
async function viewVideos() {
  const c = shell('Videor', '<button class="btn" id="syncBtn" type="button">↻ Synka från YouTube</button>');
  const r = await api('/api/admin/videos');
  const fmt = (v) => `<select data-vf="${v.id}" aria-label="Format">${Object.entries(META.formats).map(([k, n]) => `<option value="${k}" ${v.format === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  c.innerHTML = `
    <div class="notice">Nya långa videor hämtas automatiskt från kanalens RSS-flöde var 30:e minut. ${r.sync ? `Senaste synk: ${dt(r.sync.at)} – ${r.sync.ok ? `${r.sync.found} videor i flödet, ${r.sync.fresh} nya` : `fel: ${esc(r.sync.error)}`}.` : 'Ingen synk har körts än.'} ${r.people} profiler hittades i titlarna.</div>
    <div class="table-wrap"><table class="t"><thead><tr><th></th><th>Titel på sajten</th><th>Format</th><th>Personer <span class="muted">(kommaseparerat)</span></th><th class="num">Visningar</th><th>Fäst</th><th>Dold</th></tr></thead><tbody>
    ${r.items.map((v) => `<tr><td><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener"><img class="thumb-sm" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt=""></a></td>
      <td><input type="text" data-vd="${v.id}" value="${esc(v.display || v.title)}" aria-label="Titel"><small class="muted">${esc(v.title)}</small></td>
      <td>${fmt(v)}</td><td><input type="text" data-vp="${v.id}" value="${esc(v.people.join(', '))}" aria-label="Personer"></td>
      <td class="num">${num(v.views)}</td><td><input type="checkbox" data-vpin="${v.id}" ${v.pinned ? 'checked' : ''} aria-label="Fäst överst"></td><td><input type="checkbox" data-vh="${v.id}" ${v.hidden ? 'checked' : ''} aria-label="Dölj"></td></tr>`).join('')}
    </tbody></table></div>`;
  const patch = (id, body) => api(`/api/admin/videos/${id}`, { method: 'PATCH', body }).then(() => toast('Sparat'));
  c.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.vf) patch(t.dataset.vf, { format: t.value });
    if (t.dataset.vd) patch(t.dataset.vd, { display: t.value });
    if (t.dataset.vp) patch(t.dataset.vp, { people: t.value.split(',').map((s) => s.trim()).filter(Boolean) });
    if (t.dataset.vpin) patch(t.dataset.vpin, { pinned: t.checked });
    if (t.dataset.vh) patch(t.dataset.vh, { hidden: t.checked });
  });
  $('#syncBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const s = await api('/api/admin/videos/sync', { method: 'POST' });
      toast(s.fresh.length ? `${s.fresh.length} nya videor hämtade` : 'Allt är redan uppdaterat');
      viewVideos();
    } catch (err) {
      toast(err.message);
      e.target.disabled = false;
    }
  });
}

/* ---------- förfrågningar ---------- */
const LEAD_STATUS = [['ny', 'Ny'], ['kontaktad', 'Kontaktad'], ['offert', 'Offert skickad'], ['vunnen', 'Vunnen'], ['forlorad', 'Förlorad']];
const LEAD_TYPE = { sponsring: 'Sponsring', livedebatt: 'Livedebatt', forelasning: 'Föreläsning', press: 'Press', annat: 'Annat' };
async function viewLeads() {
  const c = shell('Förfrågningar', '<a class="btn btn--ghost" href="/api/admin/export/leads.csv">Exportera CSV</a>');
  const leads = await api('/api/admin/leads');
  const sum = (st) => leads.filter((l) => st.includes(l.status)).reduce((s, l) => s + (l.value_sek || 0), 0);
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span class="kpi__label">Öppen pipeline</span><span class="kpi__value">${num(sum(['ny', 'kontaktad', 'offert']))} kr</span></div>
      <div class="kpi"><span class="kpi__label">Vunnet</span><span class="kpi__value">${num(sum(['vunnen']))} kr</span></div>
      <div class="kpi"><span class="kpi__label">Nya förfrågningar</span><span class="kpi__value">${leads.filter((l) => l.status === 'ny').length}</span></div>
    </div>
    ${leads.length ? `<div class="grid">${leads.map((l) => `<section class="panel" data-lead="${l.id}">
      <h2><span>${esc(l.organisation || l.name)} <span class="chip chip--accent">${esc(LEAD_TYPE[l.type] || l.type)}</span></span><small>${dt(l.created_at)}</small></h2>
      <div class="grid grid-2"><div><p style="margin:0 0 10px;white-space:pre-wrap">${esc(l.message)}</p>
        <dl class="kv" style="grid-template-columns:110px 1fr"><dt>Kontakt</dt><dd>${esc(l.name)} · <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? ` · ${esc(l.phone)}` : ''}</dd><dt>Budget</dt><dd>${esc(l.budget || '–')}</dd><dt>Önskat datum</dt><dd>${esc(l.date_wish || '–')}</dd></dl></div>
      <div class="grid" style="gap:10px"><div class="cols"><div class="f"><label>Status</label><select data-lk="status">${LEAD_STATUS.map(([k, n]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="f"><label>Värde (kr)</label><input type="number" data-lk="value_sek" value="${l.value_sek ?? ''}"></div></div>
        <div class="f"><label>Anteckningar</label><textarea data-lk="notes" rows="3">${esc(l.notes || '')}</textarea></div></div></div></section>`).join('')}</div>` : '<div class="panel empty-state">Inga förfrågningar än. Formuläret finns under ”Samarbeten” på startsidan.</div>'}`;
  c.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-lead]');
    if (!box || !e.target.dataset.lk) return;
    await api(`/api/admin/leads/${box.dataset.lead}`, { method: 'PATCH', body: { [e.target.dataset.lk]: e.target.value } });
    toast('Sparat');
  });
}

/* ---------- utkorg ---------- */
async function viewOutbox() {
  const c = shell('Utkorg');
  const r = await api('/api/admin/outbox');
  c.innerHTML = `${r.live ? '' : '<div class="notice"><strong>E-post är inte kopplad än.</strong> Alla mejl sparas här i stället för att skickas. Lägg till <code>RESEND_API_KEY</code> i serverns miljövariabler för att skicka på riktigt.</div>'}
    <div class="grid grid-2"><div class="table-wrap"><table class="t"><thead><tr><th>Till</th><th>Ämne</th><th>Typ</th><th>Status</th><th>Tid</th></tr></thead><tbody>
    ${r.items.map((m) => `<tr class="clickable" data-mail="${m.id}"><td>${esc(m.to_email)}</td><td>${esc(m.subject)}</td><td>${esc(m.kind || '–')}</td><td><span class="st st--${m.status}" ${m.error ? `data-tip="${esc(m.error)}"` : ''}>${esc(m.status)}</span></td><td>${dt(m.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Tomt.</td></tr>'}
    </tbody></table></div><div class="panel"><h2>Förhandsvisning</h2><iframe class="mail-preview" id="mailPreview" sandbox title="Förhandsvisning av mejl"></iframe></div></div>`;
  c.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-mail]');
    if (!row) return;
    const m = await api(`/api/admin/outbox/${row.dataset.mail}`);
    $('#mailPreview').srcdoc = m.html;
  });
}

/* ---------- innehåll & stil ---------- */
async function viewContent() {
  const c = shell('Innehåll & stil', '<button class="btn" type="submit" form="contentForm">Spara allt</button>');
  const s = await api('/api/admin/settings');
  const site = s.site;
  const lines = (arr, f) => (arr || []).map(f).join('\n');
  c.innerHTML = `<form id="contentForm" class="grid" novalidate>
    <section class="panel"><h2>Stilpaket <small><a href="/stilpaket" target="_blank">Jämför alla 20 ↗</a></small></h2>
      <div class="themes">${THEMES.map((t) => `<button type="button" class="theme-opt" data-theme="${t.id}" aria-pressed="${site.theme === t.id}"><span class="sw">${['bg', 'surface', 'accent', 'accent2', 'text'].map((k) => `<i style="background:${t.vars[k]}"></i>`).join('')}</span><strong>${esc(t.name)}</strong><small>${esc(t.tagline)}</small><a href="/?stil=${t.id}" target="_blank" style="font-size:.76rem;color:var(--a-accent)">Förhandsgranska ↗</a></button>`).join('')}</div>
      <input type="hidden" name="theme" value="${esc(site.theme)}">
    </section>
    <section class="panel grid"><h2>Hero</h2>
      <div class="grid grid-2"><div class="f"><label>Slogan <span class="hint">(radbrytning = ny rad)</span></label><textarea name="slogan" rows="2">${esc(site.slogan)}</textarea></div>
      <div class="f"><label>Underrubrik</label><textarea name="subline" rows="2">${esc(site.subline)}</textarea></div></div>
      <div class="cols"><div class="f"><label>Slutkort (sista två orden markeras)</label><input type="text" name="endline" value="${esc(site.endline)}"></div>
        <div class="f"><label>Toppnotis <span class="hint">(tom = dold)</span></label><input type="text" name="announcement" value="${esc(site.announcement)}"></div></div>
      <div class="cols"><div class="f"><label>Hero-video (desktop)</label><input type="text" name="heroVideo" value="${esc(site.heroVideo)}"></div><div class="f"><label>Hero-video (mobil)</label><input type="text" name="heroVideoMobile" value="${esc(site.heroVideoMobile)}"></div><div class="f"><label>Affischbild</label><input type="text" name="heroPoster" value="${esc(site.heroPoster)}"></div></div>
      <div class="cols"><div class="f"><label>Slogan visas till (sek)</label><input type="number" step="0.05" name="heroIntroEnd" value="${esc(site.heroIntroEnd ?? 2.25)}"></div><div class="f"><label>Slutkortet visas från (sek)</label><input type="number" step="0.05" name="heroEndAt" value="${esc(site.heroEndAt ?? 18.9)}"></div></div>
    </section>
    <section class="panel grid"><h2>Om oss</h2>
      <div class="f"><label>Ingress</label><input type="text" name="about.lead" value="${esc(site.about?.lead)}"></div>
      <div class="f"><label>Berättelse <span class="hint">(ett stycke per rad)</span></label><textarea name="about.story" rows="5">${esc(lines(site.about?.story, (x) => x))}</textarea></div>
      <div class="f"><label>Varför vi gör det här <span class="hint">(en per rad: Rubrik | Text)</span></label><textarea name="about.why" rows="5">${esc(lines(site.about?.why, (x) => `${x.title} | ${x.text}`))}</textarea></div>
      <div class="f"><label>Teamet <span class="hint">(en per rad: Namn | Roll | Kort text | Instagram-länk)</span></label><textarea name="team" rows="4">${esc(lines(site.team, (x) => [x.name, x.role, x.bio, x.instagram || ''].join(' | ')))}</textarea></div>
    </section>
    <section class="panel grid"><h2>Så går det till & vanliga frågor</h2>
      <div class="f"><label>Steg <span class="hint">(Rubrik | Text)</span></label><textarea name="steps" rows="4">${esc(lines(site.steps, (x) => `${x.title} | ${x.text}`))}</textarea></div>
      <div class="f"><label>FAQ <span class="hint">(Fråga | Svar)</span></label><textarea name="faq" rows="7">${esc(lines(site.faq, (x) => `${x.q} | ${x.a}`))}</textarea></div>
    </section>
    <section class="panel grid"><h2>Samarbeten</h2>
      <div class="f"><label>Rubrik</label><input type="text" name="partner.title" value="${esc(site.partner?.title)}"></div>
      <div class="f"><label>Text</label><textarea name="partner.text" rows="2">${esc(site.partner?.text)}</textarea></div>
      <div class="f"><label>Erbjudanden <span class="hint">(Rubrik | Text)</span></label><textarea name="partner.offers" rows="4">${esc(lines(site.partner?.offers, (x) => `${x.title} | ${x.text}`))}</textarea></div>
    </section>
    <section class="panel grid"><h2>Kanaler & stöd</h2>
      <div class="cols">${Object.entries({ youtube: 'YouTube', tiktok: 'TikTok', instagramSimon: 'Instagram Simon', instagramEmil: 'Instagram Emil' }).map(([k, n]) => `<div class="f"><label>${n}</label><input type="url" name="socials.${k}" value="${esc(site.socials?.[k] || '')}"></div>`).join('')}</div>
      <div class="cols"><div class="f"><label>Swish-nummer <span class="hint">(visas om ifyllt)</span></label><input type="text" name="swish" value="${esc(site.swish)}"></div><div class="f"><label>Kontakt-e-post</label><input type="email" name="contactEmail" value="${esc(site.contactEmail)}"></div></div>
      <div class="cols">${['subscribers', 'views', 'videos'].map((k) => `<div class="f"><label>${{ subscribers: 'Prenumeranter', views: 'Visningar totalt', videos: 'Antal videor' }[k]} <span class="hint">(statistik på sajten)</span></label><input type="number" name="stats.${k}" value="${s.channel[k] ?? ''}"></div>`).join('')}</div>
    </section>
  </form>`;
  c.addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme]');
    if (!t || e.target.closest('a')) return;
    $$('[data-theme]', c).forEach((b) => b.setAttribute('aria-pressed', b === t));
    $('[name="theme"]', c).value = t.dataset.theme;
  });
  const pairs = (txt, keys) => txt.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map((p) => Object.fromEntries(keys.map((k, i) => [k, p[i] || ''])));
  $('#contentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (n) => f.querySelector(`[name="${n}"]`).value;
    const body = {
      theme: v('theme'), slogan: v('slogan'), subline: v('subline'), endline: v('endline'), announcement: v('announcement'),
      heroVideo: v('heroVideo'), heroVideoMobile: v('heroVideoMobile'), heroPoster: v('heroPoster'), heroIntroEnd: v('heroIntroEnd'), heroEndAt: v('heroEndAt'), swish: v('swish'), contactEmail: v('contactEmail'),
      about: { lead: v('about.lead'), story: v('about.story').split('\n').map((x) => x.trim()).filter(Boolean), why: pairs(v('about.why'), ['title', 'text']) },
      team: pairs(v('team'), ['name', 'role', 'bio', 'instagram']).map((m) => ({ ...m, instagram: m.instagram || null })),
      steps: pairs(v('steps'), ['title', 'text']), faq: pairs(v('faq'), ['q', 'a']),
      partner: { title: v('partner.title'), text: v('partner.text'), offers: pairs(v('partner.offers'), ['title', 'text']) },
      socials: Object.fromEntries(['youtube', 'tiktok', 'instagramSimon', 'instagramEmil'].map((k) => [k, v(`socials.${k}`)])),
      channelStats: { subscribers: v('stats.subscribers'), views: v('stats.views'), videos: v('stats.videos') },
    };
    await api('/api/admin/settings', { method: 'PUT', body });
    toast('Sparat – ändringarna syns direkt på sajten');
  });
}

/* ---------- inställningar ---------- */
async function viewSettings() {
  const c = shell('Inställningar');
  const s = await api('/api/admin/settings');
  c.innerHTML = `<div class="grid grid-2">
    <form class="panel grid" id="setForm"><h2>Drift</h2>
      <div class="f"><label for="ne">Mejla nya ansökningar till</label><input id="ne" type="email" name="notifyEmail" value="${esc(s.site.notifyEmail)}" placeholder="redaktion@…"></div>
      <div class="f"><label for="rm">Radera ansökningar automatiskt efter (månader) <span class="hint">0 = aldrig (rekommenderas inte enligt GDPR)</span></label><input id="rm" type="number" min="0" max="120" name="retentionMonths" value="${s.site.retentionMonths ?? 12}"></div>
      <label class="chk"><input type="checkbox" name="autoNotifyVideos" ${s.site.autoNotifyVideos ? 'checked' : ''}> Mejla prenumeranter automatiskt när ett nytt avsnitt dyker upp på YouTube</label>
      <div class="row"><button class="btn" type="submit">Spara</button></div>
      <h2 style="margin-top:12px">Exportera</h2>
      <div class="row"><a class="btn btn--ghost btn--sm" href="/api/admin/export/applications.csv">Ansökningar (CSV)</a><a class="btn btn--ghost btn--sm" href="/api/admin/export/subscribers.csv">Prenumeranter (CSV)</a><a class="btn btn--ghost btn--sm" href="/api/admin/export/leads.csv">Förfrågningar (CSV)</a></div>
    </form>
    <div class="grid" style="align-content:start">
      <form class="panel grid" id="pwForm"><h2>Byt lösenord</h2>
        <div class="f"><label for="pc">Nuvarande</label><input id="pc" type="password" name="current" autocomplete="current-password"></div>
        <div class="f"><label for="pn">Nytt (minst 10 tecken)</label><input id="pn" type="password" name="next" autocomplete="new-password"></div>
        <div class="row"><button class="btn" type="submit">Byt lösenord</button></div><p class="err" id="pwErr"></p></form>
      <section class="panel grid"><h2>Användare</h2>
        <div class="table-wrap"><table class="t"><thead><tr><th>E-post</th><th>Roll</th><th>Senast inloggad</th><th></th></tr></thead><tbody>${s.users.map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${dt(u.last_login)}</td><td>${u.email !== ME.email ? `<button class="btn btn--ghost btn--sm" data-deluser="${u.id}" type="button">Ta bort</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <form class="cols" id="userForm"><div class="f"><label>E-post</label><input type="email" name="email"></div><div class="f"><label>Lösenord</label><input type="password" name="password" autocomplete="new-password"></div>
          <div class="f"><label>Roll</label><select name="role"><option value="redaktor">Redaktör</option><option value="admin">Admin</option></select></div><div class="f" style="align-self:end"><button class="btn" type="submit">Lägg till</button></div></form>
      </section>
    </div></div>`;
  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await api('/api/admin/settings', { method: 'PUT', body: { notifyEmail: f.notifyEmail.value, retentionMonths: f.retentionMonths.value, autoNotifyVideos: f.autoNotifyVideos.checked } });
    toast('Sparat');
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/password', { method: 'PUT', body: { current: e.target.current.value, next: e.target.next.value } });
      e.target.reset();
      toast('Lösenordet är bytt');
    } catch (err) {
      $('#pwErr').textContent = err.message;
    }
  });
  $('#userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/admin/users', { method: 'POST', body: { email: f.email.value, password: f.password.value, role: f.role.value } });
      toast('Användaren är tillagd');
      viewSettings();
    } catch (err) {
      toast(err.message);
    }
  });
  c.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-deluser]');
    if (b && confirm('Ta bort användaren?')) (await api(`/api/admin/users/${b.dataset.deluser}`, { method: 'DELETE' }), viewSettings());
  });
}

/* ---------- router ---------- */
async function route() {
  if (!ME) return;
  $('.drawer-bg')?.remove();
  $('.drawer')?.remove();
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [section, id] = path.split('/');
  const params = new URLSearchParams(qs || '');
  try {
    if (section === 'debatter' && id) await viewDebateEdit(id);
    else if (section === 'debatter') await viewDebates();
    else if (section === 'ansokningar') await viewApplications(params);
    else if (section === 'casting') await viewCasting(id);
    else if (section === 'nyhetsbrev') await viewNewsletter();
    else if (section === 'videor') await viewVideos();
    else if (section === 'forfragningar') await viewLeads();
    else if (section === 'utkorg') await viewOutbox();
    else if (section === 'innehall') await viewContent();
    else if (section === 'installningar') await viewSettings();
    else await viewDashboard();
  } catch (err) {
    if (ME) toast(err.message);
  }
}
addEventListener('hashchange', route);

async function boot() {
  try {
    const r = await api('/api/admin/me');
    ME = r.user;
    META = r.meta;
    const d = await api('/api/admin/applications?status=ny&limit=1');
    unread = d.total;
    route();
  } catch {
    /* renderLogin har redan körts */
  }
}
boot();
