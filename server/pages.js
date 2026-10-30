// Serverrenderade undersidor: debatter, format, avsnitt, profiler, om oss m.fl.
// Delar layout (header/footer) och designsystem med startsidan.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { escapeHtml as e } from './mailer.js';
import { bootstrap } from './routes/public.js';
import { loadChannel } from './youtube.js';

const nf = new Intl.NumberFormat('sv-SE');
const num = (n) => nf.format(n || 0);
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mn` : n >= 1e3 ? `${Math.round(n / 1e3)} tn` : String(n || 0));
const dur = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const clock = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const dateSv = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => (iso ? new Date(iso).toLocaleDateString('sv-SE', opts) : '');
const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const yt = (id, t) => `https://www.youtube.com/watch?v=${id}${t ? `&t=${Math.floor(t)}s` : ''}`;
const initials = (n) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const FORMAT_LOGO = { '1vs20': '20-vs-1.svg', partiledare: '20-vs-1.svg', soffan: 'studio-soffan.svg', duellen: 'duellen.svg', panelen: 'panelen.svg', valvakan: 'valvakan.svg' };
const PARTY_COLORS = { S: '#e8112d', M: '#52bdec', SD: '#dddd00', V: '#da291c', C: '#009933', KD: '#000077', L: '#006ab3', MP: '#83cf39' };

const NAV = [['/debatter', 'Debatter'], ['/format', 'Format'], ['/avsnitt', 'Avsnitt'], ['/profiler', 'Profiler'], ['/om-oss', 'Om oss'], ['/samarbeten', 'Samarbeten']];

/** Mer om varje format – visas på /format/<format>. */
export const FORMAT_INFO = {
  '1vs20': { people: '1 + 20', rules: ['En känd profil sätter sig i mitten.', 'Tjugo personer med motsatt åsikt sitter runt hen och turas om att fråga och argumentera.', 'Ingen moderator räddar någon – det är personen i mitten som måste svara.'] },
  soffan: { people: '6', rules: ['Ett aktuellt ämne och sex gäster från olika läger.', 'Samtalet får ta tid – här möts argumenten på djupet.', 'Ämnen från bistånd och klimat till abort, migration och public service.'] },
  duellen: { people: '2', rules: ['Två debattörer möts vid samma bord.', 'Ministrar, partisekreterare, ungdomsförbund och opinionsbildare.', 'Öga mot öga – argument mot argument.'] },
  partiledare: { people: '1 + 20', rules: ['En partiledare möter tjugo väljare.', 'Väljarna ställer sina egna frågor – inga förberedda journalistfrågor.', 'Ulf Kristersson, Simona Mohamsson och Daniel Helldén har suttit i stolen.'] },
  panelen: { people: '2 + 2', rules: ['Två lag från två partier eller läger.', 'Två mot två – en lagdebatt där argumenten bollas.', 'S mot SD, S mot M, SD mot MP och KD mot C hittills.'] },
  valvakan: { people: 'Live', rules: ['Kanalens egen valvaka under valet 2026.', 'Fem debatter, samtal med Markus Allard och livesändning hela kvällen.', 'Livesändningen har över 170 000 visningar.'] },
  banditer: { people: 'Varierar', rules: ['När vi lämnar studion.', 'Utmaningar, en dag i någon annans skor och möten utanför politiken.', 'Till exempel en dag som Alexander Ernstberger och att byta liv med tre kändisar.'] },
};

let peakCache;
function peaks() {
  if (peakCache) return peakCache;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(config.contentDir, 'hero-clips.json'), 'utf8'));
    peakCache = Object.fromEntries((d.videos || []).map((v) => [v.id, v.peaks || []]));
  } catch {
    peakCache = {};
  }
  return peakCache;
}

function data() {
  const D = bootstrap();
  D.videoById = Object.fromEntries(D.videos.map((v) => [v.id, v]));
  D.personByName = Object.fromEntries(D.people.map((p) => [p.name, p]));
  D.formatByKey = Object.fromEntries(D.formats.map((f) => [f.key, f]));
  D.formatName = (k) => D.formatNames[k] || k;
  return D;
}

/* ---------- byggstenar ---------- */
function header(active) {
  return `<header class="header is-solid" id="header">
    <div class="header__inner">
      <a class="brand" href="/" aria-label="STUDIO 3 – till startsidan"><svg viewBox="0 0 1025 452" aria-hidden="true"><use href="#s3logo"/></svg><span class="brand__word">Studio 3</span></a>
      <nav class="nav" id="nav" aria-label="Huvudmeny">${NAV.map(([href, label]) => `<a href="${href}" ${active === href ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <a class="btn header__cta" href="/sok">Sök till en debatt <span class="arrow">→</span></a>
      <button class="menu-btn" id="menuBtn" aria-label="Öppna meny" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
    </div>
  </header>`;
}

function footer(D) {
  const soc = D.site.socials || {};
  const col = (title, links) => `<div><h4>${title}</h4><ul>${links.map(([h, l, ext]) => `<li><a href="${e(h)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${e(l)}</a></li>`).join('')}</ul></div>`;
  return `<footer class="footer"><div class="wrap">
    <div class="footer__grid footer__grid--wide">
      <div class="footer__brand"><a class="brand" href="/" aria-label="STUDIO 3"><svg viewBox="0 0 1025 452" aria-hidden="true"><use href="#s3logo"/></svg></a>
        <p>Olika åsikter. Samma rum. Sveriges nya plats för politisk debatt – på YouTube, TikTok och Instagram.</p></div>
      ${col('Var med', [['/debatter', 'Öppna debatter'], ['/sok', 'Talangbanken'], ['/faq', 'Så går det till'], ['/nyhetsbrev', 'Nyhetsbrev']])}
      ${col('Titta', [['/avsnitt', 'Alla avsnitt'], ['/format', 'Format'], ['/profiler', 'Profiler'], [soc.youtube || D.channel.url, 'YouTube', true]])}
      ${col('STUDIO 3', [['/om-oss', 'Om oss'], ['/samarbeten', 'Samarbeten'], ['/press', 'Press'], ['/kontakt', 'Kontakt']])}
      ${col('Följ oss', [[soc.youtube, 'YouTube', true], [soc.tiktok, 'TikTok', true], [soc.instagramSimon, 'Instagram – Simon', true], [soc.instagramEmil, 'Instagram – Emil', true]].filter(([h]) => h))}
    </div>
    <div class="footer__bottom"><span>© ${new Date().getFullYear()} STUDIO 3 · <a href="/integritet">Integritet</a> · <a href="/stilpaket">Stilpaket</a> · <a href="/admin">Admin</a></span><span>Debatten börjar här.</span></div>
  </div></footer>`;
}

function banner({ eyebrow, title, lead, crumbs = [], image, extra = '' }) {
  return `<section class="pbanner${image ? ' pbanner--image' : ''}">
    ${image ? `<div class="pbanner__bg" style="background-image:url('${e(image)}')"></div>` : ''}
    <div class="wrap pbanner__inner">
      ${crumbs.length ? `<nav class="crumbs" aria-label="Brödsmulor"><a href="/">Start</a>${crumbs.map(([h, l]) => (h ? ` / <a href="${e(h)}">${e(l)}</a>` : ` / <span>${e(l)}</span>`)).join('')}</nav>` : ''}
      ${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}
      <h1 class="display">${title}</h1>
      ${lead ? `<p class="lead">${lead}</p>` : ''}
      ${extra}
    </div>
  </section>`;
}

function videoCard(v, D, { big = false } = {}) {
  const people = (v.people || []).slice(0, 4).join(', ');
  return `<article class="vcard${big ? ' vcard--big' : ''}" data-item data-format="${e(v.format)}" data-views="${v.views || 0}" data-pos="${v.position}" data-text="${e(`${v.display} ${v.title} ${v.topic || ''} ${(v.people || []).join(' ')}`.toLowerCase())}">
    <a class="vcard__link" href="/avsnitt/${encodeURIComponent(v.id)}">
      <div class="vcard__thumb">
        <img src="${thumb(v.id, big ? 'maxresdefault' : 'mqdefault')}" alt="" loading="lazy" width="320" height="180">
        <div class="vcard__play"><span><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span></div>
        ${v.live ? '<span class="vcard__live">LIVE</span>' : ''}
        <span class="vcard__fmt">${e(D.formatName(v.format))}</span>
        ${v.duration ? `<span class="vcard__dur">${clock(v.duration)}</span>` : ''}
      </div>
      <h3 class="vcard__title">${v.quote ? `”${e(v.display)}”` : e(v.display)}</h3>
    </a>
    ${people ? `<p class="vcard__people">${e(people)}</p>` : ''}
    <div class="vcard__meta">${v.views ? `<span>${compact(v.views)} visningar</span>` : ''}${v.published ? `<span>${dateSv(v.published, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}<a href="${yt(v.id)}" target="_blank" rel="noopener">YouTube ↗</a></div>
  </article>`;
}

function personCard(p) {
  const color = PARTY_COLORS[p.party];
  return `<a class="person" href="/profiler/${e(p.slug)}" data-item data-party="${e(p.party || '')}" data-views="${p.views}" data-count="${p.videos.length}" data-text="${e(p.name.toLowerCase())}">
    <span class="avatar"${color ? ` style="background:${color};color:${['M', 'SD', 'MP'].includes(p.party) ? '#111' : '#fff'}"` : ''}>${e(initials(p.name))}</span>
    <span><span class="person__name">${e(p.name)}</span>${p.party ? `<span class="party party--${p.party}">${p.party}</span>` : ''}
      <span class="person__meta" style="display:block">${p.videos.length} avsnitt · ${compact(p.views)} visningar</span></span>
  </a>`;
}

function debateCard(d, D) {
  const art = d.cover_url || (D.formatByKey[d.format]?.top ? thumb(D.formatByKey[d.format].top, 'maxresdefault') : null);
  const left = d.deadline ? Math.ceil((new Date(d.deadline) - Date.now()) / 864e5) : null;
  return `<article class="card debate${d.featured ? ' debate--featured' : ''}">
    ${d.featured && art ? `<div class="debate__art"><img src="${e(art)}" alt="" loading="lazy"></div>` : ''}
    <div class="${d.featured ? 'debate__body' : 'debate__stack'}">
      <span class="badge-format">${e(d.formatName)}</span>
      <h3>${e(d.title)}</h3>
      ${d.statement ? `<p class="debate__statement">”${e(d.statement)}”</p>` : ''}
      ${d.summary ? `<p class="muted" style="margin:0">${e(d.summary)}</p>` : ''}
      <dl class="debate__meta">
        ${d.event_at ? `<div><dt>Inspelning</dt><dd>${dateSv(d.event_at, { day: 'numeric', month: 'long' })}</dd></div>` : ''}
        ${d.location ? `<div><dt>Plats</dt><dd>${e(d.location)}</dd></div>` : ''}
        ${d.deadline ? `<div><dt>Sista dag</dt><dd>${dateSv(d.deadline, { day: 'numeric', month: 'long' })}</dd></div>` : ''}
      </dl>
      ${d.needs?.length ? `<div class="debate__needs">${d.needs.map((n) => `<div class="need"><span>${e(n.label)}</span><strong>${n.count ? `${n.count} st` : 'Sökes'}</strong></div>`).join('')}</div>` : ''}
      <div class="debate__foot">${left != null && d.open ? `<span class="countdown${left <= 3 ? ' countdown--soon' : ''}"><span class="dot"></span>${left <= 0 ? 'Stänger i dag' : `${left} dagar kvar`}</span>` : '<span></span>'}
        ${d.open ? `<a class="btn" href="/sok/${encodeURIComponent(d.slug)}">Sök nu <span class="arrow">→</span></a>` : d.youtube_url ? `<a class="btn btn--ghost" href="${e(d.youtube_url)}" target="_blank" rel="noopener">Se avsnittet ↗</a>` : '<span class="chip">Ansökan stängd</span>'}</div>
    </div>
  </article>`;
}

const filterBar = ({ formats, search = 'Sök…', sorts = [], parties }) => `<div class="toolbar" data-controls>
  ${sorts.length ? `<div class="tabs" role="group" aria-label="Sortering">${sorts.map(([k, l], i) => `<button type="button" data-sort="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>` : ''}
  <label class="search"><span class="sr-only">${e(search)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-search placeholder="${e(search)}" autocomplete="off"></label>
</div>
${formats ? `<div class="filters" role="group" aria-label="Filtrera" data-filter="format" style="margin-bottom:24px"><button type="button" data-value="" aria-pressed="true">Alla</button>${formats.map(([k, l]) => `<button type="button" data-value="${e(k)}" aria-pressed="false">${e(l)}</button>`).join('')}</div>` : ''}
${parties ? `<div class="filters" role="group" aria-label="Filtrera på parti" data-filter="party" style="margin-bottom:24px"><button type="button" data-value="" aria-pressed="true">Alla</button>${parties.map((p) => `<button type="button" data-value="${p}" aria-pressed="false">${p}</button>`).join('')}</div>` : ''}
<p class="muted list-count" data-count></p>`;

const ctaBand = (title, text, href, label) => `<section class="section section--tight"><div class="wrap"><div class="cta-band">
  <div><h2>${title}</h2><p class="lead">${text}</p></div><a class="btn btn--light" href="${href}">${label} <span class="arrow">→</span></a></div></div></section>`;

function leadForm(type = 'sponsring', heading = 'Berätta vad ni har i tankarna') {
  const opt = (v, l) => `<option value="${v}" ${type === v ? 'selected' : ''}>${l}</option>`;
  return `<form class="card form" data-form="lead" novalidate>
    <h3>${heading}</h3>
    <div class="field"><label for="l-type">Det gäller</label><select id="l-type" name="type">${opt('sponsring', 'Sponsring / annonsering')}${opt('livedebatt', 'Livedebatt på event, skola eller festival')}${opt('forelasning', 'Moderering eller föreläsning')}${opt('press', 'Press och media')}${opt('annat', 'Något annat')}</select></div>
    <div class="form-row"><div class="field"><label for="l-name">Namn</label><input id="l-name" name="name" type="text" autocomplete="name" required></div>
      <div class="field"><label for="l-org">Organisation</label><input id="l-org" name="organisation" type="text" autocomplete="organization"></div></div>
    <div class="form-row"><div class="field"><label for="l-email">E-post</label><input id="l-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="l-phone">Telefon</label><input id="l-phone" name="phone" type="tel" autocomplete="tel"></div></div>
    <div class="form-row"><div class="field"><label for="l-budget">Ungefärlig budget</label><select id="l-budget" name="budget"><option value="">Vet inte än</option><option>Under 25 000 kr</option><option>25 000–75 000 kr</option><option>75 000–200 000 kr</option><option>Över 200 000 kr</option></select></div>
      <div class="field"><label for="l-date">Önskat datum</label><input id="l-date" name="date_wish" type="text" placeholder="t.ex. vecka 27"></div></div>
    <div class="field"><label for="l-msg">Meddelande</label><textarea id="l-msg" name="message" required></textarea></div>
    <div class="hp" aria-hidden="true"><label>Lämna tomt <input name="hp" tabindex="-1" autocomplete="off"></label></div>
    <button class="btn" type="submit">Skicka <span class="arrow">→</span></button>
    <p class="form-status" role="status"></p>
  </form>`;
}

function newsletterForm(D) {
  return `<form class="form" data-form="newsletter" novalidate>
    <div class="field"><label for="n-email" class="sr-only">E-post</label><input id="n-email" name="email" type="email" placeholder="din@epost.se" autocomplete="email" required></div>
    <fieldset class="pref" style="border:0;padding:0;margin:0"><legend class="sr-only">Vad vill du få?</legend>
      <label class="check"><input type="checkbox" name="prefs" value="debatter" checked> Nya debatter att söka till</label>
      <label class="check"><input type="checkbox" name="prefs" value="videor" checked> Nya avsnitt</label>
      <label class="check"><input type="checkbox" name="prefs" value="event"> Livedebatter &amp; publikplatser</label></fieldset>
    <div class="field"><label for="n-county" class="sr-only">Län</label><select id="n-county" name="county"><option value="">Hela Sverige (välj län för lokala event)</option>${D.counties.map((c) => `<option>${e(c)}</option>`).join('')}</select></div>
    <div class="hp" aria-hidden="true"><label>Lämna tomt <input name="hp" tabindex="-1" autocomplete="off"></label></div>
    <button class="btn" type="submit">Prenumerera <span class="arrow">→</span></button>
    <p class="form-status" role="status"></p>
  </form>`;
}

const steps = (D) => `<div class="steps">${(D.site.steps || []).map((s) => `<div class="step"><h3>${e(s.title)}</h3><p>${e(s.text)}</p></div>`).join('')}</div>`;
const faq = (D) => `<div class="faq">${(D.site.faq || []).map((f) => `<details><summary>${e(f.q)}</summary><p>${e(f.a)}</p></details>`).join('')}</div>`;
const statRow = (items) => `<div class="statrow">${items.map(([v, l]) => `<div><strong>${v}</strong><span>${l}</span></div>`).join('')}</div>`;

/* ---------- sidor ---------- */
function pageDebatter(D) {
  const open = D.debates.filter((d) => d.open);
  const upcoming = D.debates.filter((d) => !d.open && ['closed', 'recorded'].includes(d.status));
  const published = D.debates.filter((d) => d.status === 'published');
  return {
    title: 'Debatter – sök till STUDIO 3', active: '/debatter',
    description: 'Öppna debatter som söker deltagare just nu. Sök till 1 mot 20, Studio Soffan, Duellen och fler.',
    body: `${banner({ eyebrow: 'Debatter', title: 'Vill du sitta<br><span class="accent">i stolen?</span>', lead: 'Vi söker väljare, debattörer och publik med åsikter som spretar åt alla håll. Välj en debatt och sök på fem minuter – eller anmäl dig till talangbanken.', crumbs: [[null, 'Debatter']], extra: `<div class="row-btns"><a class="btn" href="#oppna">Se öppna debatter</a><a class="btn btn--ghost" href="/sok">Talangbanken</a></div>` })}
      <section class="section" id="oppna"><div class="wrap">
        <div class="section__head"><span class="eyebrow">Söker deltagare nu</span><h2>${open.length ? `${open.length} öppna debatter` : 'Inga öppna just nu'}</h2></div>
        <div class="debates">${open.map((d) => debateCard(d, D)).join('') || '<div class="empty">Prenumerera på nyhetsbrevet så får du veta när nästa debatt öppnar. <a class="link" href="/nyhetsbrev">Bevaka nya debatter →</a></div>'}
          <article class="card debate debate--talent"><div class="debate__stack"><span class="badge-format">Talangbanken</span><h3>Hittar du inget som passar?</h3>
          <p class="muted" style="margin:0">Anmäl dig till talangbanken. När vi planerar en debatt där just din röst behövs hör vi av oss först.</p>
          <div class="debate__foot"><span></span><a class="btn btn--ghost" href="/sok">Anmäl intresse <span class="arrow">→</span></a></div></div></article></div>
      </div></section>
      ${upcoming.length ? `<section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">På gång</span><h2>Kommande avsnitt</h2></div><div class="debates">${upcoming.map((d) => debateCard(d, D)).join('')}</div></div></section>` : ''}
      ${published.length ? `<section class="section"><div class="wrap"><div class="section__head"><span class="eyebrow">Klart</span><h2>Publicerade debatter</h2></div><div class="debates">${published.map((d) => debateCard(d, D)).join('')}</div></div></section>` : ''}
      <section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Så går det till</span><h2>Från ansökan<br>till inspelning</h2></div>${steps(D)}<p><a class="link" href="/faq">Vanliga frågor →</a></p></div></section>
      ${ctaBand('Missa aldrig en debatt', 'Få ett mejl när nya debatter öppnar för ansökan.', '/nyhetsbrev', 'Prenumerera')}`,
  };
}

function pageFormat(D) {
  const rows = D.formats.filter((f) => f.count);
  return {
    title: 'Format – STUDIO 3', active: '/format',
    description: 'Alla STUDIO 3:s format: 1 mot 20, Studio Soffan, Duellen, Partiledare vs 20 väljare, Panelen, Valvakan och Studio Banditer.',
    body: `${banner({ eyebrow: 'Format', title: 'Samma rum.<br><span class="accent">Olika regler.</span>', lead: 'Från en partiledare mot tjugo väljare till sex personer i en soffa. Varje format har sin egen puls.', crumbs: [[null, 'Format']] })}
      <section class="section"><div class="wrap"><div class="formats">${rows.map((f) => `<a class="card format format--link" href="/format/${f.key}">
        <div class="format__bg">${f.top ? `<img src="${thumb(f.top, 'hqdefault')}" alt="" loading="lazy">` : ''}</div>
        ${f.logo ? `<img class="format__logo ${f.logo === 'studio-soffan.svg' ? 'round' : ''}" src="/assets/img/logos/${f.logo}" alt="">` : ''}
        <div class="format__name">${e(f.name)}</div><p class="format__tag">${e(f.tagline)}</p><p>${e(f.desc)}</p>
        <div class="format__foot"><span>${f.count} avsnitt · ${compact(f.views)} visningar</span><span class="link">Läs mer →</span></div></a>`).join('')}</div></div></section>
      <section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Jämför</span><h2>Formaten i siffror</h2></div>
        <div class="table-scroll"><table class="ptable"><thead><tr><th>Format</th><th>Deltagare</th><th>Upplägg</th><th class="num">Avsnitt</th><th class="num">Visningar</th><th>Mest sedda</th></tr></thead><tbody>
        ${rows.map((f) => `<tr><td><a href="/format/${f.key}"><strong>${e(f.name)}</strong></a></td><td>${e(FORMAT_INFO[f.key]?.people || '–')}</td><td>${e(f.tagline)}</td><td class="num">${f.count}</td><td class="num">${num(f.views)}</td><td>${f.top ? `<a href="/avsnitt/${encodeURIComponent(f.top)}">${e(D.videoById[f.top]?.display || '')}</a>` : '–'}</td></tr>`).join('')}
        </tbody></table></div></div></section>
      ${ctaBand('Vilket format passar dig?', 'Sök till en öppen debatt eller anmäl dig till talangbanken.', '/debatter', 'Se öppna debatter')}`,
  };
}

function pageFormatDetail(D, key) {
  const f = D.formatByKey[key];
  if (!f || !f.count) return null;
  const info = FORMAT_INFO[key] || { rules: [], people: '–' };
  const vids = D.videos.filter((v) => v.format === key);
  const top = [...vids].sort((a, b) => (b.views || 0) - (a.views || 0));
  const people = D.people.filter((p) => p.videos.some((id) => D.videoById[id]?.format === key)).slice(0, 30);
  const open = D.debates.filter((d) => d.open && (d.format === key || (key === '1vs20' && d.format === 'partiledare')));
  return {
    title: `${f.name} – STUDIO 3`, active: '/format', description: `${f.tagline} ${f.desc}`, image: f.top ? thumb(f.top, 'maxresdefault') : undefined,
    body: `${banner({ eyebrow: 'Format', title: e(f.name), lead: e(f.tagline), crumbs: [['/format', 'Format'], [null, f.name]], image: f.top ? thumb(f.top, 'maxresdefault') : null,
      extra: `${f.logo ? `<img class="pbanner__logo ${f.logo === 'studio-soffan.svg' ? 'round' : ''}" src="/assets/img/logos/${f.logo}" alt="">` : ''}${statRow([[f.count, 'avsnitt'], [compact(f.views), 'visningar'], [e(info.people), 'deltagare'], [people.length, 'profiler']])}` })}
      <section class="section"><div class="wrap two-col">
        <div><span class="eyebrow">Så funkar det</span><h2 style="margin:16px 0 24px">${e(f.name)}</h2><p class="lead">${e(f.desc)}</p>
          <ol class="rules">${info.rules.map((r) => `<li>${e(r)}</li>`).join('')}</ol>
          ${f.playlist ? `<p><a class="btn btn--ghost" href="https://www.youtube.com/playlist?list=${f.playlist}" target="_blank" rel="noopener">Hela spellistan på YouTube ↗</a></p>` : ''}</div>
        <div>${top[0] ? `<span class="eyebrow">Mest sedda</span><div style="height:16px"></div>${videoCard(top[0], D, { big: true })}` : ''}</div>
      </div></section>
      ${open.length ? `<section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Söker deltagare</span><h2>Var med i nästa</h2></div><div class="debates">${open.map((d) => debateCard(d, D)).join('')}</div></div></section>` : ''}
      <section class="section"><div class="wrap"><div class="section__head section__head--row"><div class="section__head" style="margin:0"><span class="eyebrow">Avsnitt</span><h2>Alla ${vids.length} avsnitt</h2></div></div>
        <div data-list>${filterBar({ search: 'Sök i formatet…', sorts: [['popular', 'Mest sedda'], ['latest', 'Senaste']] })}<div class="videos">${top.map((v) => videoCard(v, D)).join('')}</div></div></div></section>
      ${people.length ? `<section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Har medverkat</span><h2>Ansikten i ${e(f.name)}</h2></div><div class="people">${people.map(personCard).join('')}</div></div></section>` : ''}
      ${ctaBand(`Vill du vara med i ${e(f.name)}?`, 'Anmäl dig till talangbanken så hör vi av oss när vi planerar nästa avsnitt.', '/sok', 'Anmäl dig')}`,
  };
}

function pageAvsnitt(D) {
  const keys = [...new Set(D.videos.map((v) => v.format))].filter((k) => D.formatNames[k]);
  const order = ['1vs20', 'soffan', 'duellen', 'partiledare', 'panelen', 'valvakan', 'banditer', 'kommentarer', 'ovrigt'];
  keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const list = [...D.videos].sort((a, b) => a.position - b.position);
  return {
    title: 'Alla avsnitt – STUDIO 3', active: '/avsnitt', description: `Alla ${list.length} debatter och samtal från STUDIO 3 – sök på ämne, person eller parti.`,
    body: `${banner({ eyebrow: 'Avsnitt', title: 'Se debatterna', lead: `Alla ${list.length} långa avsnitt – från 1 mot 20 och Duellen till Studio Soffan och Valvakan. Sök på ämne, person eller parti.`, crumbs: [[null, 'Avsnitt']],
      extra: statRow([[num(D.stats.views), 'visningar totalt'], [compact(D.stats.topViews), 'visningar på största debatten'], [list.length, 'långa avsnitt']]) })}
      <section class="section"><div class="wrap"><div data-list>${filterBar({ formats: keys.map((k) => [k, D.formatName(k)]), search: 'Sök ämne, person eller parti…', sorts: [['latest', 'Senaste'], ['popular', 'Mest sedda']] })}
        <div class="videos">${list.map((v) => videoCard(v, D)).join('')}</div></div></div></section>
      ${ctaBand('Prenumerera på YouTube', 'Nya debatter varje vecka – missa inte nästa.', `${D.channel.url}?sub_confirmation=1`, 'Prenumerera')}`,
  };
}

function pageVideo(D, id) {
  const v = D.videoById[id];
  if (!v) return null;
  const same = D.videos.filter((x) => x.format === v.format && x.id !== v.id).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 6);
  const popular = [...D.videos].filter((x) => x.id !== v.id && x.format !== v.format).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3);
  const pk = (peaks()[v.id] || []).filter((p) => p.at);
  const people = (v.people || []).map((n) => D.personByName[n]).filter(Boolean);
  const iso = v.duration ? `PT${Math.floor(v.duration / 3600)}H${Math.floor((v.duration % 3600) / 60)}M${v.duration % 60}S` : undefined;
  return {
    title: `${v.quote ? `”${v.display}”` : v.display} | STUDIO 3`, active: '/avsnitt', image: thumb(v.id, 'maxresdefault'),
    description: `${D.formatName(v.format)}${people.length ? ` med ${people.map((p) => p.name).join(', ')}` : ''}. ${v.views ? `${num(v.views)} visningar.` : ''}`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'VideoObject', name: v.display, description: v.title, thumbnailUrl: thumb(v.id, 'maxresdefault'), embedUrl: `https://www.youtube.com/embed/${v.id}`, ...(v.published ? { uploadDate: v.published } : {}), ...(iso ? { duration: iso } : {}), ...(v.views ? { interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: v.views } } : {}) },
    body: `<section class="section episode"><div class="wrap">
        <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Start</a> / <a href="/avsnitt">Avsnitt</a> / <a href="/format/${e(v.format)}">${e(D.formatName(v.format))}</a></nav>
        <div class="episode__grid">
          <div>
            <div class="yt-facade" data-player="${e(v.id)}" role="button" tabindex="0" aria-label="Spela ${e(v.display)}">
              <img src="${thumb(v.id, 'maxresdefault')}" alt="">
              <span class="yt-facade__play"><svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>
            </div>
            <span class="badge-format" style="margin-top:22px;display:inline-flex">${e(D.formatName(v.format))}${v.live ? ' · Live' : ''}</span>
            <h1 class="display episode__title">${v.quote ? `”${e(v.display)}”` : e(v.display)}</h1>
            <div class="chips">${v.views ? `<span class="chip">${num(v.views)} visningar</span>` : ''}${v.duration ? `<span class="chip">${dur(v.duration)}</span>` : ''}${v.published ? `<span class="chip">${dateSv(v.published)}</span>` : ''}${v.topic ? `<span class="chip">Ämne: ${e(v.topic)}</span>` : ''}</div>
            ${pk.length ? `<div class="peaks"><strong>Hetaste ögonblicken</strong> <span class="muted">enligt YouTubes ”Mest uppspelade”</span><div class="chips">${pk.map((p) => `<button type="button" class="chip chip--accent" data-seek="${Math.floor(p.at)}">▶ ${clock(p.at)}${p.source === 'mest-uppspelade' ? ' · mest uppspelade' : ''}</button>`).join('')}</div></div>` : ''}
            <div class="row-btns"><a class="btn" href="${yt(v.id)}" target="_blank" rel="noopener">Se på YouTube ↗</a><button class="btn btn--ghost" type="button" data-share>Dela</button><a class="btn btn--ghost" href="/sok">Vill du vara med? Sök här</a></div>
          </div>
          <aside class="episode__side">
            ${people.length ? `<h3>Medverkande</h3><div class="people people--stack">${people.map(personCard).join('')}</div>` : ''}
            <h3 style="margin-top:28px">Mer ${e(D.formatName(v.format))}</h3><a class="link" href="/format/${e(v.format)}">Om formatet →</a>
          </aside>
        </div>
      </div></section>
      ${same.length ? `<section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Fler avsnitt</span><h2>Mer ${e(D.formatName(v.format))}</h2></div><div class="videos">${same.map((x) => videoCard(x, D)).join('')}</div></div></section>` : ''}
      <section class="section"><div class="wrap"><div class="section__head"><span class="eyebrow">Populärt</span><h2>Mest sedda just nu</h2></div><div class="videos">${popular.map((x) => videoCard(x, D)).join('')}</div></div></section>`,
  };
}

function pageProfiler(D) {
  const parties = Object.keys(PARTY_COLORS).filter((p) => D.people.some((x) => x.party === p));
  return {
    title: 'Profiler – de som suttit i stolen | STUDIO 3', active: '/profiler', description: `${D.people.length} politiker, debattörer och opinionsbildare som debatterat i STUDIO 3.`,
    body: `${banner({ eyebrow: 'Profiler', title: 'De har suttit<br><span class="accent">i stolen</span>', lead: `${D.people.length} politiker, debattörer och opinionsbildare har debatterat hos oss – från statsministern till ungdomsförbundens ordförande.`, crumbs: [[null, 'Profiler']] })}
      <section class="section"><div class="wrap"><div data-list>${filterBar({ search: 'Sök namn…', sorts: [['count', 'Flest avsnitt'], ['views', 'Flest visningar'], ['name', 'A–Ö']], parties })}
        <div class="people">${D.people.map(personCard).join('')}</div></div></div></section>
      ${ctaBand('Vill du också sitta i stolen?', 'Anmäl dig till talangbanken – vi söker nya röster hela tiden.', '/sok', 'Anmäl dig')}`,
  };
}

function pagePerson(D, slug) {
  const p = D.people.find((x) => x.slug === slug);
  if (!p) return null;
  const vids = p.videos.map((id) => D.videoById[id]).filter(Boolean).sort((a, b) => (b.views || 0) - (a.views || 0));
  const met = {};
  for (const v of vids) for (const n of v.people) if (n !== p.name) met[n] = (met[n] || 0) + 1;
  const opponents = Object.entries(met).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => D.personByName[n]).filter(Boolean);
  const formats = [...new Set(vids.map((v) => D.formatName(v.format)))];
  const partyName = D.parties.find((x) => x.id === p.party)?.name;
  const color = PARTY_COLORS[p.party];
  return {
    title: `${p.name} i STUDIO 3`, active: '/profiler', image: vids[0] ? thumb(vids[0].id, 'maxresdefault') : undefined,
    description: `${p.name} har medverkat i ${vids.length} avsnitt av STUDIO 3 med totalt ${num(p.views)} visningar.`,
    body: `${banner({ eyebrow: p.role || partyName || 'Profil', title: e(p.name), crumbs: [['/profiler', 'Profiler'], [null, p.name]], image: vids[0] ? thumb(vids[0].id, 'maxresdefault') : null,
      lead: `Har medverkat i ${vids.length} ${vids.length === 1 ? 'avsnitt' : 'avsnitt'}: ${e(formats.join(', '))}.`,
      extra: `<div class="profile-head"><span class="avatar avatar--xl"${color ? ` style="background:${color};color:${['M', 'SD', 'MP'].includes(p.party) ? '#111' : '#fff'}"` : ''}>${e(initials(p.name))}</span>${p.party ? `<span class="party party--${p.party}">${p.party}</span>` : ''}</div>${statRow([[vids.length, 'avsnitt'], [compact(p.views), 'visningar'], [formats.length, formats.length === 1 ? 'format' : 'format'], [opponents.length, 'motdebattörer']])}` })}
      <section class="section"><div class="wrap"><div class="section__head"><span class="eyebrow">Avsnitt</span><h2>${e(p.name.split(' ')[0])} i STUDIO 3</h2></div><div class="videos">${vids.map((v) => videoCard(v, D)).join('')}</div></div></section>
      ${opponents.length ? `<section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Har mött</span><h2>Har debatterat mot</h2></div><div class="people">${opponents.map(personCard).join('')}</div></div></section>` : ''}
      ${ctaBand(`Vill du möta ${e(p.name.split(' ')[0])}?`, 'Anmäl dig till talangbanken – kanske sitter du i stolen mitt emot nästa gång.', '/sok', 'Anmäl dig')}`,
  };
}

function pageOm(D) {
  const a = D.site.about || {};
  const timeline = [
    ['2023', 'YouTube-kanalen STUDIO 3 skapas av Simon Claesson och Emil Widén – först med humor som tema.'],
    ['Debatten tar över', 'Formaten 1 mot 20, Duellen och Studio Soffan sätter människor med helt olika åsikter i samma rum.'],
    ['1 000 000', 'Jan Emanuel mot 20 miljöpartister blir kanalens första avsnitt med en miljon visningar.'],
    ['Statsministern', 'Ulf Kristersson möter 20 väljare – liksom fler partiledare efter honom.'],
    ['100 000', 'Kanalen passerar 100 000 prenumeranter.'],
    ['Valet 2026', 'Egen valvaka live och en livedebatt på Stortorget i Örebro inför runt 300 personer.'],
  ];
  return {
    title: 'Om oss – STUDIO 3', active: '/om-oss', description: a.lead,
    body: `${banner({ eyebrow: 'Om oss', title: 'Olika åsikter.<br><span class="accent">Samma rum.</span>', lead: e(a.lead), crumbs: [[null, 'Om oss']], extra: statRow([[num(D.stats.subscribers), 'prenumeranter'], [`${(D.stats.views / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mn`, 'visningar'], [num(D.stats.videos), 'videor'], [D.people.length, 'profiler']]) })}
      <section class="section"><div class="wrap two-col"><div><span class="eyebrow">Vår historia</span><h2 style="margin:16px 0 24px">Från humor<br>till debatt</h2>${(a.story || []).map((s) => `<p class="lead">${e(s)}</p>`).join('')}</div>
        <div><ol class="timeline">${timeline.map(([t, x]) => `<li><strong>${e(t)}</strong><p>${e(x)}</p></li>`).join('')}</ol></div></div></section>
      <section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Varför vi gör det här</span><h2>Det vi tror på</h2></div>
        <div class="why why--4">${(a.why || []).map((w) => `<div class="card"><h3>${e(w.title)}</h3><p>${e(w.text)}</p></div>`).join('')}</div></div></section>
      <section class="section"><div class="wrap"><div class="section__head"><span class="eyebrow">Teamet</span><h2>Människorna bakom</h2></div>
        <div class="team" style="margin-top:0">${(D.site.team || []).map((m) => `<article class="card member"><div class="member__mono" aria-hidden="true">${e(initials(m.name))}</div><h3>${e(m.name)}</h3><p class="member__role">${e(m.role)}</p><p>${e(m.bio)}</p>${m.instagram ? `<a class="link" href="${e(m.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>` : ''}</article>`).join('')}</div>
        ${(D.quotes || []).map((q) => `<figure class="quote"><blockquote>”${e(q.text)}”</blockquote><figcaption>— ${e(q.by)}, ${e(q.source)}</figcaption></figure>`).join('')}</div></section>
      ${ctaBand('Skriv om oss eller samarbeta', 'Pressmaterial, loggor och siffror finns samlat på presssidan.', '/press', 'Till press')}`,
  };
}

function pageFaq(D) {
  return {
    title: 'Så går det till – vanliga frågor | STUDIO 3', active: '/debatter', description: 'Hur du söker till STUDIO 3, vad som händer efter ansökan och hur vi hanterar dina uppgifter.',
    body: `${banner({ eyebrow: 'Så går det till', title: 'Från ansökan<br><span class="accent">till inspelning</span>', lead: 'Allt du behöver veta innan du söker till en debatt.', crumbs: [['/debatter', 'Debatter'], [null, 'Så går det till']] })}
      <section class="section"><div class="wrap">${steps(D)}</div></section>
      <section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Vanliga frågor</span><h2>Frågor &amp; svar</h2></div>${faq(D)}<p style="margin-top:28px">Läs mer om hur vi hanterar personuppgifter i vår <a class="link" href="/integritet">integritetspolicy</a>.</p></div></section>
      ${ctaBand('Redo?', 'Välj en öppen debatt eller anmäl dig till talangbanken.', '/debatter', 'Se öppna debatter')}`,
  };
}

function pageSamarbeten(D) {
  const pt = D.site.partner || {};
  const process = [['Kontakt', 'Ni berättar vad ni vill uppnå. Vi återkommer inom två arbetsdagar.'], ['Upplägg', 'Vi föreslår format, tider, budget och hur samarbetet syns.'], ['Produktion', 'Vi spelar in i studion eller på er plats – med vår redaktion och teknik.'], ['Publicering', 'Avsnittet släpps i våra kanaler och ni får en uppföljning av resultatet.']];
  return {
    title: 'Samarbeten & livedebatter – STUDIO 3', active: '/samarbeten', description: pt.text,
    body: `${banner({ eyebrow: 'Samarbeten & event', title: e(pt.title || 'Samarbeta med oss'), lead: e(pt.text || ''), crumbs: [[null, 'Samarbeten']],
      extra: statRow([[num(D.stats.subscribers), 'prenumeranter'], [`${(D.stats.views / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mn`, 'visningar'], [num(D.stats.topViews), 'visningar, toppavsnitt'], [D.people.length, 'profiler i stolen']]) })}
      <section class="section"><div class="wrap"><div class="section__head"><span class="eyebrow">Erbjudanden</span><h2>Så kan vi jobba ihop</h2></div>
        <div class="why why--4">${(pt.offers || []).map((o) => `<div class="card"><h3>${e(o.title)}</h3><p>${e(o.text)}</p></div>`).join('')}</div></div></section>
      <section class="section section--alt"><div class="wrap two-col"><div><span class="eyebrow">Exempel</span><h2 style="margin:16px 0 20px">Livedebatt på<br>Stortorget i Örebro</h2>
        <p class="lead">Inför valet 2026 tog vi studion ut på Stortorget i Örebro. Markus Allard (Örebropartiet) mötte John Johansson (S) inför runt 300 personer – modererat av Simon och Emil.</p>
        <p class="muted">Vill ni ha en livedebatt på er festival, skola, kommun eller konferens? Vi tar med format, moderatorer och publikengagemang.</p></div>
        <div><span class="eyebrow">Processen</span><ol class="timeline" style="margin-top:16px">${process.map(([t, x]) => `<li><strong>${t}</strong><p>${x}</p></li>`).join('')}</ol></div></div></section>
      <section class="section" id="forfragan"><div class="wrap two-col"><div><span class="eyebrow">Kontakt</span><h2 style="margin:16px 0 20px">Berätta om<br>er idé</h2><p class="lead">Fyll i formuläret så återkommer vi inom två arbetsdagar med ett förslag.</p></div>${leadForm('sponsring')}</div></section>`,
  };
}

function pagePress(D) {
  const ch = loadChannel().channel;
  const assets = [['s3-logo.svg', 'S3-logga (orange)'], ['s3-logo-currentcolor.svg', 'S3-logga (enfärgad)'], ['studio3-wordmark.svg', 'STUDIO 3. – ordmärke'], ['studio-soffan.svg', 'Studio Soffan'], ['duellen.svg', 'Duellen'], ['20-vs-1.svg', '20 VS 1'], ['panelen.svg', 'Panelen'], ['valvakan.svg', 'Valvakan']];
  return {
    title: 'Press – STUDIO 3', active: '/om-oss', description: 'Fakta, siffror, loggor och pressklipp om STUDIO 3.',
    body: `${banner({ eyebrow: 'Press', title: 'Press &amp;<br><span class="accent">media</span>', lead: 'Fakta, siffror, loggor och pressklipp. Hör av er för intervjuer med Simon och Emil.', crumbs: [['/om-oss', 'Om oss'], [null, 'Press']] })}
      <section class="section"><div class="wrap two-col"><div><span class="eyebrow">Fakta</span><h2 style="margin:16px 0 24px">STUDIO 3 i korthet</h2>
        <table class="ptable ptable--kv"><tbody>
          <tr><th>Grundare</th><td>Simon Claesson och Emil Widén</td></tr><tr><th>Startade på YouTube</th><td>${dateSv(ch.joined)}</td></tr>
          <tr><th>Prenumeranter</th><td>${num(D.stats.subscribers)}</td></tr><tr><th>Visningar totalt</th><td>${num(D.stats.views)}</td></tr>
          <tr><th>Videor</th><td>${num(D.stats.videos)} (varav ${ch.shorts} Shorts)</td></tr><tr><th>Största avsnittet</th><td>${num(D.stats.topViews)} visningar</td></tr>
          <tr><th>Format</th><td>${D.formats.filter((f) => f.count).map((f) => e(f.name)).join(', ')}</td></tr><tr><th>Kanaler</th><td>YouTube, TikTok, Instagram</td></tr>
        </tbody></table></div>
        <div><span class="eyebrow">Pressklipp</span><div class="press" style="margin-top:16px">${(D.press || []).map((p) => `<a href="${e(p.url)}" target="_blank" rel="noopener"><div><strong>${e(p.outlet)}</strong><span>${e(p.title)}</span></div><span aria-hidden="true">↗</span></a>`).join('')}</div>
          ${(D.quotes || []).map((q) => `<blockquote class="pquote">”${e(q.text)}”<cite>— ${e(q.by)}, ${e(q.source)}</cite></blockquote>`).join('')}</div></div></section>
      <section class="section section--alt"><div class="wrap"><div class="section__head"><span class="eyebrow">Material</span><h2>Loggor &amp; färger</h2><p class="lead">Ladda ner som SVG. Använd loggorna oförändrade och på lugn bakgrund.</p></div>
        <div class="assets">${assets.map(([f, l]) => `<a class="asset" href="/assets/img/logos/${f}" download><span class="asset__img"${f.includes('currentcolor') ? ' style="background:#f1f1f1"' : ''}><img src="/assets/img/logos/${f}" alt="" loading="lazy"></span><span>${l}</span><small>SVG ↓</small></a>`).join('')}</div>
        <div class="swatches">${[['#F1944F', 'Studio 3-orange'], ['#0F0F0F', 'Studiosvart'], ['#FFFFFF', 'Vit']].map(([c, n]) => `<div><i style="background:${c}"></i><strong>${n}</strong><span>${c}</span></div>`).join('')}</div></div></section>
      <section class="section"><div class="wrap two-col"><div><span class="eyebrow">Pressförfrågan</span><h2 style="margin:16px 0 20px">Intervju eller<br>frågor?</h2><p class="lead">Skicka en förfrågan så hör vi av oss.</p></div>${leadForm('press', 'Pressförfrågan')}</div></section>`,
  };
}

function pageNyhetsbrev(D) {
  return {
    title: 'Nyhetsbrev – STUDIO 3', active: '', description: 'Få ett mejl när nya debatter öppnar för ansökan och när nya avsnitt släpps.',
    body: `${banner({ eyebrow: 'Nyhetsbrev', title: 'Missa aldrig<br><span class="accent">en debatt</span>', lead: 'Få ett mejl när nya debatter öppnar för ansökan, när nya avsnitt släpps och när det finns publikplatser till livedebatter nära dig.', crumbs: [[null, 'Nyhetsbrev']] })}
      <section class="section"><div class="wrap two-col"><div class="card">${newsletterForm(D)}</div>
        <div><h3>Det här får du</h3><ul class="checks"><li>Först att veta när en debatt söker deltagare</li><li>Nya avsnitt direkt i inkorgen</li><li>Publikplatser till livedebatter i ditt län</li><li>Inget spam – avsluta med ett klick</li></ul>
        <p class="muted">Vi använder dubbel bekräftelse. Läs mer i vår <a class="link" href="/integritet">integritetspolicy</a>.</p></div></div></section>`,
  };
}

function pageKontakt(D) {
  const soc = D.site.socials || {};
  const cards = [['/sok', 'Vill vara med', 'Sök till en debatt eller anmäl dig till talangbanken.'], ['/samarbeten', 'Samarbeten & event', 'Sponsring, livedebatter, föreläsningar och egna serier.'], ['/press', 'Press', 'Fakta, loggor och intervjuförfrågningar.'], ['/faq', 'Vanliga frågor', 'Om ansökan, inspelning och personuppgifter.']];
  return {
    title: 'Kontakt – STUDIO 3', active: '', description: 'Kontakta STUDIO 3 om deltagande, samarbeten, livedebatter och press.',
    body: `${banner({ eyebrow: 'Kontakt', title: 'Hör av<br><span class="accent">dig</span>', lead: 'Välj vad det gäller – eller skriv direkt i formuläret.', crumbs: [[null, 'Kontakt']] })}
      <section class="section"><div class="wrap"><div class="why why--4">${cards.map(([h, t, x]) => `<a class="card card--link" href="${h}"><h3>${t}</h3><p>${x}</p><span class="link">Gå vidare →</span></a>`).join('')}</div></div></section>
      <section class="section section--alt"><div class="wrap two-col"><div><span class="eyebrow">Meddelande</span><h2 style="margin:16px 0 20px">Skriv till oss</h2>
        <p class="lead">Vi läser allt och svarar så snart vi kan.</p>
        <ul class="checks">${[[soc.youtube, 'YouTube'], [soc.tiktok, 'TikTok'], [soc.instagramSimon, 'Instagram – Simon'], [soc.instagramEmil, 'Instagram – Emil']].filter(([h]) => h).map(([h, l]) => `<li><a class="link" href="${e(h)}" target="_blank" rel="noopener">${l} ↗</a></li>`).join('')}</ul>
        ${D.site.contactEmail ? `<p>E-post: <a class="link" href="mailto:${e(D.site.contactEmail)}">${e(D.site.contactEmail)}</a></p>` : ''}</div>${leadForm('annat', 'Skicka ett meddelande')}</div></section>`,
  };
}

const ROUTES = {
  '/debatter': pageDebatter, '/format': pageFormat, '/avsnitt': pageAvsnitt, '/profiler': pageProfiler, '/om-oss': pageOm,
  '/faq': pageFaq, '/samarbeten': pageSamarbeten, '/press': pagePress, '/nyhetsbrev': pageNyhetsbrev, '/kontakt': pageKontakt,
};

/** Returnerar { title, description, body, ... } för en undersida, eller null. */
export function renderSubpage(pathname) {
  const D = data();
  let page = null;
  if (ROUTES[pathname]) page = ROUTES[pathname](D);
  else {
    const m = pathname.match(/^\/(format|avsnitt|profiler)\/([^/]+)$/);
    if (m) page = { format: pageFormatDetail, avsnitt: pageVideo, profiler: pagePerson }[m[1]](D, m[2]);
  }
  if (!page) return null;
  page.body = `${header(page.active)}<main id="innehall">${page.body}</main>${footer(D)}`;
  return page;
}

/** Alla undersidor – används av sitemap och den statiska exporten. */
export function subpageRoutes() {
  const D = data();
  return [
    ...Object.keys(ROUTES),
    ...D.formats.filter((f) => f.count).map((f) => `/format/${f.key}`),
    ...D.videos.map((v) => `/avsnitt/${v.id}`),
    ...D.people.map((p) => `/profiler/${p.slug}`),
  ];
}
