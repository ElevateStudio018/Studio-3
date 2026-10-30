import {
  $, $$, esc, bootstrapData, num, compact, views, duration, dateSv, timeSv, daysLeft, initials, thumb, ytUrl,
  api, track, toast, showErrors, formJson, styleBar, modal, ICON,
} from './common.js';

const D = bootstrapData();
const site = D.site;
const formatName = (k) => D.formatNames[k] || k;
const videoById = Object.fromEntries(D.videos.map((v) => [v.id, v]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- header & meny ---------- */
const header = $('#header');
if (site.announcement) {
  const a = $('#announce');
  a.textContent = site.announcement;
  a.hidden = false;
  document.body.classList.add('has-announce');
  document.documentElement.style.setProperty('--announce-h', `${a.offsetHeight}px`);
}
let lastY = 0;
function onScroll() {
  const y = scrollY;
  const heroH = $('#hero').offsetHeight;
  header.classList.toggle('is-solid', y > heroH - 90);
  header.classList.toggle('is-hidden', y > heroH && y > lastY + 4 && !document.body.classList.contains('menu-open'));
  if (y < lastY - 4) header.classList.remove('is-hidden');
  $('#mobileCta').classList.toggle('is-on', y > heroH * 0.9 && y < document.body.scrollHeight - innerHeight * 1.6);
  lastY = y;
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();
$('#menuBtn').addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  $('#menuBtn').setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});
$$('#nav a, .header__cta').forEach((a) => a.addEventListener('click', () => {
  document.body.classList.remove('menu-open');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}));
// Markera aktiv sektion i menyn
const navLinks = $$('#nav a');
const sectionIo = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) navLinks.forEach((a) => a.setAttribute('aria-current', a.hash === `#${e.target.id}`));
}, { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach((a) => { const s = a.hash && document.querySelector(a.hash); if (s) sectionIo.observe(s); });

/* ---------- hero: slogan → hetsig montage → "Debatten börjar här" ---------- */
const hero = $('#hero');
const video = $('#heroVideo');
const INTRO_END = Number(site.heroIntroEnd) || 2.25; // sekunder in i videon då slogan lämnar plats för montaget
const END_AT = Number(site.heroEndAt) || 18.9;        // då väggen av debatter zoomar ut och slutkortet tar över
const setPhase = (p) => (hero.dataset.phase = p);

function renderSlogan() {
  const lines = (site.slogan || 'Olika åsikter.\nSamma rum.').split('\n');
  $('#slogan').innerHTML = lines.map((l) => `<span class="line"><span>${esc(l)}</span></span>`).join('');
  $('#subline').textContent = site.subline || '';
}
function renderEndline() {
  const words = (site.endline || 'Debatten börjar här.').split(' ');
  const tail = words.splice(-2).join(' ');
  $('#endline').innerHTML = `<span>${esc(words.join(' '))}</span> <span class="accent">${esc(tail)}</span>`;
}
renderSlogan();
renderEndline();

function showIntro() {
  $('#heroIntro').hidden = false;
  $('#heroEnd').hidden = true;
  $('#heroEnd').classList.remove('is-in');
  renderSlogan(); // startar om animationen
  setPhase('intro');
  $('#skipBtn').hidden = false;
  $('#replayBtn').hidden = true;
}
function showEnd(settled = false) {
  $('#heroIntro').hidden = true;
  $('#heroEnd').hidden = false;
  requestAnimationFrame(() => $('#heroEnd').classList.add('is-in'));
  setPhase(settled ? 'settled' : 'end');
  $('#skipBtn').hidden = true;
  $('#replayBtn').hidden = false;
}

const small = innerWidth < 760 || navigator.connection?.saveData;
const clips = (D.heroClips || []).filter((c) => c.id && Number.isFinite(Number(c.start)));
const useYoutube = (site.heroMode || 'youtube') === 'youtube' && clips.length >= 2;
const END_CLIP = Math.min(7, clips.length);  // slutkortet visas efter så här många klipp
let driver = null;
video.poster = site.heroPoster || '../public/assets/video/hero-poster.jpg';

let mp4 = null;
const getMp4 = () => (mp4 ??= mp4Driver());
// MP4 (fallback eller vald i admin): tidslinjen styrs av videons tid
function mp4Driver() {
  hero.dataset.mode = 'mp4';
  video.preload = 'auto';
  video.src = (small && site.heroVideoMobile) || site.heroVideo || '../public/assets/video/hero.mp4';
  video.play().catch(() => showEnd(true));
  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    if (hero.dataset.phase === 'settled') return;
    $('#heroProgress').style.width = `${(t / (video.duration || 22.5)) * 100}%`;
    if (t >= END_AT && hero.dataset.phase !== 'end') showEnd();
    else if (t >= INTRO_END && t < END_AT && hero.dataset.phase === 'intro') {
      $('#heroIntro').hidden = true;
      setPhase('montage');
    }
  });
  video.addEventListener('ended', () => {
    track('hero_complete');
    showEnd(true);
    video.loop = true;
    video.currentTime = 0;
    video.play().catch(() => {});
  });
  return {
    play: () => video.play().catch(() => {}),
    pause: () => video.pause(),
    restart: () => {
      video.loop = false;
      video.currentTime = 0;
      video.play().catch(() => {});
    },
    skip: () => (video.currentTime = END_AT + 0.4),
  };
}

// Riktiga avsnitt: de mest uppspelade ögonblicken, spelade via YouTube
async function youtubeDriver(retry = false) {
  hero.dataset.mode = 'youtube';
  $('.hero__media').style.background = `#000 url("${video.poster}") center / cover`; // syns tills första klippet laddat
  const { youtubeHero } = await import('./hero-youtube.js');
  const flash = $('#heroFlash');
  const caption = $('#heroClip');
  const yt = youtubeHero({
    container: $('#heroYt'),
    clips,
    onCut(clip, i, loop) {
      flash.classList.remove('is-on', 'alt');
      void flash.offsetWidth;
      flash.classList.add('is-on');
      flash.classList.toggle('alt', i % 3 === 2);
      caption.hidden = false;
      caption.href = `${ytUrl(clip.id)}&t=${Math.floor(clip.start)}s`;
      $('.hero__clip-title', caption).textContent = clip.title || videoById[clip.id]?.display || '';
      $('.hero__clip-tag', caption).textContent = clip.source === 'mest-uppspelade' ? 'Mest uppspelade' : '';
      if (hero.dataset.phase === 'settled') return;
      const step = loop * clips.length + i;
      $('#heroProgress').style.width = `${Math.min(1, step / END_CLIP) * 100}%`;
      if (loop > 0) {
        track('hero_complete');
        showEnd(true);
      } else if (step >= END_CLIP && hero.dataset.phase !== 'end') showEnd();
      else if (step >= 1 && hero.dataset.phase === 'intro') {
        $('#heroIntro').hidden = true;
        setPhase('montage');
      }
    },
    onFail() {
      // YouTube kunde inte autospela (t.ex. i vissa appars webbläsare) – visa MP4 och erbjud att starta klippen med ett tryck
      driver = getMp4();
      hero.dataset.mode = 'mp4';
      driver.play();
      $('#soundBtn').hidden = true;
      $('#realBtn').hidden = false;
      if (retry) toast('YouTube kunde inte spelas i den här webbläsaren.');
    },
  });
  $('#soundBtn').hidden = false;
  return {
    play: () => yt.play(),
    pause: () => yt.pause(),
    restart: () => yt.restart(),
    skip: () => {},
    sound: (on) => yt.setMuted(!on),
  };
}

if (reduceMotion || navigator.connection?.saveData) {
  showEnd(true);
  $('#pauseBtn').hidden = true;
} else {
  showIntro();
  if (useYoutube) youtubeDriver().then((d) => (driver ??= d)).catch(() => (driver = getMp4()));
  else driver = getMp4();
  // Spara batteri: pausa när hero inte syns
  new IntersectionObserver(([e]) => {
    if (hero.dataset.userPaused || !driver) return;
    if (e.isIntersecting) driver.play();
    else driver.pause();
  }, { threshold: 0.1 }).observe(hero);
}
$('#skipBtn').addEventListener('click', () => {
  driver?.skip();
  showEnd();
});
$('#replayBtn').addEventListener('click', () => {
  delete hero.dataset.userPaused;
  driver?.restart();
  driver?.play();
  showIntro();
});
$('#pauseBtn').addEventListener('click', (e) => {
  if (hero.dataset.userPaused) {
    delete hero.dataset.userPaused;
    driver?.play();
    e.currentTarget.textContent = '❚❚';
    e.currentTarget.setAttribute('aria-label', 'Pausa bakgrundsvideon');
  } else {
    hero.dataset.userPaused = '1';
    driver?.pause();
    e.currentTarget.textContent = '▶';
    e.currentTarget.setAttribute('aria-label', 'Spela bakgrundsvideon');
  }
});
$('#realBtn').addEventListener('click', async (e) => {
  e.currentTarget.hidden = true;
  mp4?.pause();
  showIntro();
  driver = await youtubeDriver(true);
});
$('#soundBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on);
  e.currentTarget.textContent = on ? '🔊 Ljud' : '🔇 Ljud';
  driver?.sound?.(on);
});

// Ticker med senaste avsnitten
const latest = [...D.videos].filter((v) => !v.live).sort((a, b) => a.position - b.position).slice(0, 12);
const tickerItems = latest.map((v) => `<a href="${ytUrl(v.id)}" target="_blank" rel="noopener">${esc(v.display)}</a>`).join('');
$('#ticker').innerHTML = tickerItems + tickerItems.replace(/<a /g, '<a aria-hidden="true" tabindex="-1" ');
if (latest[0]) {
  $('#latestBtn').href = ytUrl(latest[0].id);
  $('#latestBtn').addEventListener('click', (e) => (e.preventDefault(), openVideo(latest[0])));
}
const openDebates = D.debates.filter((d) => d.open);
if (openDebates.length) {
  const live = $('#heroLive');
  live.hidden = false;
  live.lastElementChild.textContent = openDebates.length === 1 ? '1 debatt söker deltagare nu' : `${openDebates.length} debatter söker deltagare nu`;
}

/* ---------- statistik ---------- */
const statItems = [
  { value: D.stats.subscribers, label: 'prenumeranter på YouTube', fmt: (n) => num(n) },
  { value: D.stats.views, label: 'visningar totalt', fmt: (n) => `${(n / 1e6).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mn` },
  { value: D.stats.videos, label: 'videor och klipp', fmt: (n) => num(n) },
  { value: D.stats.topViews, label: 'visningar på största debatten', fmt: (n) => num(n) },
];
$('#stats').innerHTML = statItems.map((s, i) => `<div class="stat"><div class="stat__num" data-i="${i}">${s.fmt(s.value)}</div><div class="stat__label">${esc(s.label)}</div></div>`).join('');
if (!reduceMotion) {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    $$('.stat__num').forEach((el) => {
      const s = statItems[el.dataset.i];
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1600);
        el.textContent = s.fmt(Math.round(s.value * (1 - (1 - p) ** 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.4 });
  io.observe($('#stats'));
}

/* ---------- ansökan som lager på samma sida ---------- */
const sheet = $('#applySheet');
const frame = $('#applyFrame');
function openApply(slug) {
  const base = location.pathname.endsWith('.html') ? (slug ? `sok-${slug}.html` : 'sok.html') : (slug ? `/sok/${encodeURIComponent(slug)}` : '/sok');
  const stil = new URLSearchParams(location.search).get('stil');
  frame.src = `${base}?embed=1${stil ? `&stil=${encodeURIComponent(stil)}` : ''}`;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#applyClose').focus();
}
function closeApply(hash) {
  sheet.hidden = true;
  frame.src = 'about:blank';
  document.body.style.overflow = '';
  if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
}
$('#applyClose').addEventListener('click', () => closeApply());
addEventListener('keydown', (e) => e.key === 'Escape' && !sheet.hidden && closeApply());
addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.s3 === 'close-apply') closeApply(e.data.hash);
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-apply]');
  if (!a) return;
  e.preventDefault();
  document.querySelector('.modal .modal__close')?.click();
  openApply(a.dataset.apply);
});

/* ---------- debatter ---------- */
const FORMAT_LOGO = { '1vs20': '20-vs-1.svg', partiledare: '20-vs-1.svg', soffan: 'studio-soffan.svg', duellen: 'duellen.svg', panelen: 'panelen.svg', valvakan: 'valvakan.svg' };
const formatArt = (key) => {
  const f = D.formats.find((x) => x.key === key);
  return f?.top ? thumb(f.top, 'maxresdefault') : null;
};
function countdown(d) {
  const left = daysLeft(d.deadline);
  if (left == null || !d.open) return '<span></span>';
  const cls = left <= 3 ? 'countdown countdown--soon' : 'countdown';
  const txt = left <= 0 ? 'Stänger i dag' : left === 1 ? '1 dag kvar att söka' : `${left} dagar kvar att söka`;
  return `<span class="${cls}"><span class="dot"></span>${txt}</span>`;
}
function debateCard(d) {
  const art = d.cover_url || formatArt(d.format);
  const logo = FORMAT_LOGO[d.format];
  const needs = (d.needs || []).map((n) => `<div class="need"><span>${esc(n.label)}</span><strong>${n.count ? `${n.count} st` : 'Sökes'}</strong></div>`).join('');
  const action = d.open
    ? `<button class="btn" type="button" data-apply="${esc(d.slug)}">Sök nu <span class="arrow">→</span></button>`
    : d.youtube_url ? `<a class="btn btn--ghost" href="${esc(d.youtube_url)}" target="_blank" rel="noopener">Se avsnittet ↗</a>` : '<span class="chip">Ansökan stängd</span>';
  const body = `
    <span class="badge-format">${esc(d.formatName)}</span>
    <h3>${esc(d.title)}</h3>
    ${d.statement ? `<p class="debate__statement">”${esc(d.statement)}”</p>` : ''}
    ${d.summary ? `<p class="muted" style="margin:0">${esc(d.summary)}</p>` : ''}
    ${d.description ? `<details class="debate__more"><summary>Läs mer</summary><p class="muted">${esc(d.description)}</p></details>` : ''}
    <dl class="debate__meta">
      ${d.event_at ? `<div><dt>Inspelning</dt><dd>${dateSv(d.event_at)}${timeSv(d.event_at) ? `, ${timeSv(d.event_at)}` : ''}</dd></div>` : ''}
      ${d.location ? `<div><dt>Plats</dt><dd>${esc(d.location)}</dd></div>` : ''}
      ${d.deadline ? `<div><dt>Sista dag</dt><dd>${dateSv(d.deadline)}</dd></div>` : ''}
    </dl>
    ${needs ? `<div class="debate__needs"><span class="muted" style="font-size:.85rem;font-weight:700">VI SÖKER</span>${needs}</div>` : ''}
    <div class="debate__foot">${countdown(d)}${action}</div>`;
  if (d.featured && d.open) {
    return `<article class="card debate debate--featured">
      <div class="debate__art">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}${logo && d.cover_url ? `<img class="logo" src="../public/assets/img/logos/${logo}" alt="">` : ''}</div>
      <div class="debate__body">${body}</div></article>`;
  }
  return `<article class="card debate">${body}</article>`;
}
$('#debates').innerHTML = (openDebates.length
  ? openDebates.map(debateCard).join('')
  : `<div class="empty"><h3>Inga öppna ansökningar just nu</h3><p>Prenumerera på nyhetsbrevet så får du veta direkt när nästa debatt öppnar.</p><a class="btn" href="#nyhetsbrev">Bevaka nya debatter</a></div>`) + `
  <article class="card debate debate--talent">
    <span class="badge-format">Talangbanken</span>
    <h3>Hittar du inget som passar?</h3>
    <p class="muted" style="margin:0">Anmäl dig till talangbanken. När vi planerar en debatt där just din röst behövs, hör vi av oss först.</p>
    <div class="debate__foot"><span></span><button class="btn btn--ghost" type="button" data-apply="">Anmäl intresse <span class="arrow">→</span></button></div>
  </article>`;
const upcoming = D.debates.filter((d) => !d.open && ['closed', 'recorded'].includes(d.status));
const published = D.debates.filter((d) => d.status === 'published');
$('#debatesMore').innerHTML = [
  upcoming.length && `<h3 style="margin:56px 0 18px">Kommande avsnitt</h3><div class="debates">${upcoming.map(debateCard).join('')}</div>`,
  published.length && `<h3 style="margin:56px 0 18px">Publicerade debatter</h3><div class="debates">${published.map(debateCard).join('')}</div>`,
].filter(Boolean).join('');

/* ---------- steg & FAQ ---------- */
$('#steps').innerHTML = (site.steps || []).map((s) => `<div class="step"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('');
$('#faq').innerHTML = (site.faq || []).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');

/* ---------- format ---------- */
const formatsWithEpisodes = D.formats.filter((f) => f.count > 0);
$('#formats').innerHTML = formatsWithEpisodes.map((f) => `<article class="card format" tabindex="0" role="button" data-format-open="${f.key}" aria-label="Allt om ${esc(f.name)}">
    <div class="format__bg">${f.top ? `<img src="${thumb(f.top, 'hqdefault')}" alt="" loading="lazy">` : ''}</div>
    ${f.logo ? `<img class="format__logo ${f.logo === 'studio-soffan.svg' ? 'round' : ''}" src="../public/assets/img/logos/${f.logo}" alt="">` : ''}
    <div class="format__name">${esc(f.name)}</div>
    <p class="format__tag">${esc(f.tagline)}</p>
    <p>${esc(f.desc)}</p>
    <div class="format__foot"><span>${f.count} avsnitt · ${compact(f.views)} visningar</span><span class="link">Allt om formatet →</span></div>
  </article>`).join('');
$('#formatTable').innerHTML = `<table class="ptable"><thead><tr><th>Format</th><th>Deltagare</th><th>Upplägg</th><th class="num">Avsnitt</th><th class="num">Visningar</th><th>Mest sedda</th></tr></thead><tbody>
  ${formatsWithEpisodes.map((f) => `<tr><td><button class="linkbtn" type="button" data-format-open="${f.key}"><strong>${esc(f.name)}</strong></button></td><td>${esc(f.people || '–')}</td><td>${esc(f.tagline)}</td><td class="num">${f.count}</td><td class="num">${num(f.views)}</td><td>${f.top ? `<button class="linkbtn" type="button" data-video="${f.top}">${esc(videoById[f.top]?.display || '')}</button>` : '–'}</td></tr>`).join('')}
  </tbody></table>`;
const miniCard = (v) => `<button class="vcard vcard--mini" type="button" data-video="${v.id}">
  <span class="vcard__thumb"><img src="${thumb(v.id)}" alt="" loading="lazy"><span class="vcard__dur">${duration(v.duration)}</span></span>
  <span class="vcard__title">${v.quote ? `”${esc(v.display)}”` : esc(v.display)}</span><span class="muted" style="font-size:.82rem">${views(v.views)}</span></button>`;
function openFormat(key) {
  const f = D.formats.find((x) => x.key === key);
  if (!f) return;
  const vids = D.videos.filter((v) => v.format === key).sort((a, b) => (b.views || 0) - (a.views || 0));
  const people = D.people.filter((p) => p.videos.some((id) => videoById[id]?.format === key));
  const open = D.debates.filter((d) => d.open && (d.format === key || (key === '1vs20' && d.format === 'partiledare')));
  modal(`<div class="modal__body" style="padding-top:28px">
    ${f.logo ? `<img src="../public/assets/img/logos/${f.logo}" alt="" style="height:${f.logo === 'studio-soffan.svg' ? 80 : 40}px;width:auto">` : ''}
    <h3 class="display" style="font-size:clamp(1.8rem,4vw,3rem)">${esc(f.name)}</h3>
    <p class="lead" style="margin:0">${esc(f.tagline)} ${esc(f.desc)}</p>
    <div class="statrow"><div><strong>${f.count}</strong><span>avsnitt</span></div><div><strong>${compact(f.views)}</strong><span>visningar</span></div><div><strong>${esc(f.people || '–')}</strong><span>deltagare</span></div><div><strong>${people.length}</strong><span>profiler</span></div></div>
    ${f.rules?.length ? `<h4 style="margin:18px 0 0">Så funkar det</h4><ol class="rules">${f.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
    ${open.length ? `<h4 style="margin:10px 0 0">Söker deltagare nu</h4><div class="chips">${open.map((d) => `<button class="btn btn--sm" type="button" data-apply="${esc(d.slug)}">Sök till ${esc(d.title)} →</button>`).join('')}</div>` : `<p><button class="btn btn--sm" type="button" data-apply="">Anmäl dig till talangbanken →</button></p>`}
    <h4 style="margin:18px 0 0">Alla ${vids.length} avsnitt</h4>
    <div class="mgrid">${vids.map(miniCard).join('')}</div>
    ${people.length ? `<h4 style="margin:18px 0 0">Har medverkat</h4><div class="chips">${people.map((p) => `<button class="chip" type="button" data-person="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    ${f.playlist ? `<p><a class="btn btn--ghost btn--sm" href="https://www.youtube.com/playlist?list=${f.playlist}" target="_blank" rel="noopener">Hela spellistan på YouTube ↗</a></p>` : ''}
  </div>`, { label: f.name });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-format-open]');
  if (!el) return;
  e.preventDefault();
  document.querySelector('.modal .modal__close')?.click();
  openFormat(el.dataset.formatOpen);
});
$('#formats').addEventListener('keydown', (e) => {
  const el = e.target.closest('[data-format-open]');
  if (el && (e.key === 'Enter' || e.key === ' ')) (e.preventDefault(), openFormat(el.dataset.formatOpen));
});

/* ---------- avsnitt ---------- */
const vstate = { sort: 'latest', format: '', q: '', limit: 12 };
const formatKeys = [...new Set(D.videos.map((v) => v.format))].filter((k) => D.formatNames[k]);
const order = ['1vs20', 'soffan', 'duellen', 'partiledare', 'panelen', 'valvakan', 'banditer', 'kommentarer', 'ovrigt'];
formatKeys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
$('#formatFilters').innerHTML = [`<button type="button" data-format="" aria-pressed="true">Alla</button>`,
  ...formatKeys.map((k) => `<button type="button" data-format="${k}" aria-pressed="false">${esc(formatName(k))}</button>`)].join('');

function filteredVideos() {
  const q = vstate.q.trim().toLowerCase();
  let list = D.videos.filter((v) => (!vstate.format || v.format === vstate.format) &&
    (!q || `${v.display} ${v.title} ${v.topic || ''} ${(v.people || []).join(' ')}`.toLowerCase().includes(q)));
  list = vstate.sort === 'popular' ? list.sort((a, b) => (b.views || 0) - (a.views || 0)) : list.sort((a, b) => a.position - b.position);
  return list;
}
function videoCard(v) {
  const people = (v.people || []).slice(0, 4).join(', ');
  return `<article class="vcard">
    <button class="vcard__open" type="button" data-video="${v.id}" aria-label="Spela ${esc(v.display)}">
      <div class="vcard__thumb">
        <img src="${thumb(v.id)}" srcset="${thumb(v.id)} 320w, ${thumb(v.id, 'hqdefault')} 480w, ${thumb(v.id, 'sddefault')} 640w" sizes="(max-width: 700px) 100vw, 320px" alt="" loading="lazy" width="320" height="180">
        <div class="vcard__play"><span>${ICON.play}</span></div>
        ${v.live ? '<span class="vcard__live">LIVE</span>' : ''}
        <span class="vcard__fmt">${esc(formatName(v.format))}</span>
        ${v.duration ? `<span class="vcard__dur">${duration(v.duration)}</span>` : ''}
      </div>
    </button>
    <h3 class="vcard__title"><button class="linkbtn" type="button" data-video="${v.id}">${v.quote ? `”${esc(v.display)}”` : esc(v.display)}</button></h3>
    ${people ? `<p class="vcard__people">${esc(people)}</p>` : ''}
    <div class="vcard__meta">${v.views ? `<span>${views(v.views)}</span>` : ''}${v.published ? `<span>${dateSv(v.published, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}<a href="${ytUrl(v.id)}" target="_blank" rel="noopener">YouTube ↗</a></div>
  </article>`;
}
function renderVideos() {
  const list = filteredVideos();
  $('#videos').innerHTML = list.length ? list.slice(0, vstate.limit).map(videoCard).join('') : '<div class="empty" style="grid-column:1/-1">Inga avsnitt matchar sökningen.</div>';
  $('#videoCount').textContent = `Visar ${Math.min(vstate.limit, list.length)} av ${list.length} avsnitt`;
  $('#moreBtn').hidden = list.length <= vstate.limit;
  $('#allBtn').hidden = list.length <= vstate.limit;
}
renderVideos();
$$('#avsnitt .tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('#avsnitt .tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  vstate.sort = b.dataset.sort;
  vstate.limit = 12;
  renderVideos();
}));
$('#formatFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#formatFilters button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  vstate.format = b.dataset.format;
  vstate.limit = 12;
  renderVideos();
});
let searchT;
$('#videoSearch').addEventListener('input', (e) => {
  clearTimeout(searchT);
  searchT = setTimeout(() => ((vstate.q = e.target.value), (vstate.limit = 12), renderVideos()), 160);
});
$('#moreBtn').addEventListener('click', () => ((vstate.limit += 12), renderVideos()));
$('#allBtn').addEventListener('click', () => ((vstate.limit = 999), renderVideos()));

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function openVideo(v, start = 0) {
  track('video_click', false);
  const people = (v.people || []).map((n) => (personByName[n] ? `<button class="chip" type="button" data-person="${esc(n)}">${esc(n)}</button>` : `<span class="chip">${esc(n)}</span>`)).join('');
  const peaks = (D.peaks?.[v.id] || []).filter((p) => p.at);
  const more = D.videos.filter((x) => x.format === v.format && x.id !== v.id).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 4);
  const m = modal(`
    <div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&start=${Math.floor(start)}" title="${esc(v.display)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <div class="modal__body">
      <span class="badge-format">${esc(formatName(v.format))}${v.views ? ` · ${views(v.views)}` : ''}${v.duration ? ` · ${duration(v.duration)}` : ''}</span>
      <h3>${v.quote ? `”${esc(v.display)}”` : esc(v.display)}</h3>
      ${people ? `<div class="chips">${people}</div>` : ''}
      ${peaks.length ? `<div><strong>Hetaste ögonblicken</strong> <span class="muted">enligt YouTubes ”Mest uppspelade”</span><div class="chips" style="margin-top:8px">${peaks.map((p) => `<button class="chip chip--accent" type="button" data-seek="${Math.floor(p.at)}">▶ ${clock(p.at)}${p.source === 'mest-uppspelade' ? ' · mest uppspelade' : ''}</button>`).join('')}</div></div>` : ''}
      <div class="modal__actions">
        <a class="btn" href="${ytUrl(v.id)}" target="_blank" rel="noopener">${ICON.youtube} Se på YouTube</a>
        <button class="btn btn--ghost" type="button" data-format-open="${esc(v.format)}">Mer ${esc(formatName(v.format))}</button>
        <button class="btn btn--ghost" type="button" data-apply="">Vill du vara med? Sök här</button>
      </div>
      ${more.length ? `<h4 style="margin:8px 0 0">Fler avsnitt</h4><div class="mgrid">${more.map(miniCard).join('')}</div>` : ''}
    </div>`, { label: v.display });
  m.el.addEventListener('click', (ev) => {
    const seek = ev.target.closest('[data-seek]');
    if (seek) $('.player iframe', m.el).src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&start=${seek.dataset.seek}`;
  });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-video]');
  if (!el || e.metaKey || e.ctrlKey) return;
  const v = videoById[el.dataset.video];
  if (!v) return;
  e.preventDefault();
  document.querySelector('.modal .modal__close')?.click();
  setTimeout(() => openVideo(v), document.querySelector('.modal') ? 260 : 0);
});

/* ---------- profiler ---------- */
const PARTY_HUE = { S: '#e8112d', M: '#52bdec', SD: '#dddd00', V: '#da291c', C: '#009933', KD: '#000077', L: '#006ab3', MP: '#83cf39' };
const personByName = Object.fromEntries(D.people.map((p) => [p.name, p]));
const pstate = { q: '', party: '', sort: 'count', all: false };
$('#peopleLead').textContent = `${D.people.length} politiker, debattörer och opinionsbildare har debatterat hos oss. Klicka på en person för att se alla avsnitt och vilka hen mött.`;
const parties = Object.keys(PARTY_HUE).filter((p) => D.people.some((x) => x.party === p));
$('#partyFilters').innerHTML = [`<button type="button" data-party="" aria-pressed="true">Alla partier</button>`, ...parties.map((p) => `<button type="button" data-party="${p}" aria-pressed="false">${p}</button>`)].join('');
const avatar = (p, cls = '') => `<span class="avatar ${cls}" ${p.party && PARTY_HUE[p.party] ? `style="background:${PARTY_HUE[p.party]};color:${['M', 'SD', 'MP'].includes(p.party) ? '#111' : '#fff'}"` : ''}>${esc(initials(p.name))}</span>`;
function renderPeople() {
  const q = pstate.q.toLowerCase();
  const sorters = { count: (a, b) => b.videos.length - a.videos.length || b.views - a.views, views: (a, b) => b.views - a.views, name: (a, b) => a.name.localeCompare(b.name, 'sv') };
  const list = D.people.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!pstate.party || p.party === pstate.party)).sort(sorters[pstate.sort]);
  const shown = q || pstate.party || pstate.all ? list : list.slice(0, 15);
  $('#people').innerHTML = shown.map((p) => `
    <button class="person" type="button" data-person="${esc(p.name)}">
      ${avatar(p)}
      <span><span class="person__name">${esc(p.name)}</span>${p.party ? `<span class="party party--${p.party}">${p.party}</span>` : ''}
        <span class="person__meta" style="display:block">${p.role ? `${esc(p.role)} · ` : ''}${p.videos.length} avsnitt · ${compact(p.views)} visningar</span></span>
    </button>`).join('') || '<div class="empty" style="grid-column:1/-1">Ingen träff.</div>';
  $('#morePeople').hidden = shown.length === list.length;
  $('#morePeople').textContent = `Visa alla ${list.length} profiler`;
}
renderPeople();
$('#peopleSearch').addEventListener('input', (e) => ((pstate.q = e.target.value), renderPeople()));
$('#morePeople').addEventListener('click', () => ((pstate.all = true), renderPeople()));
$('#partyFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#partyFilters button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  pstate.party = b.dataset.party;
  renderPeople();
});
$('#peopleSort').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#peopleSort button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  pstate.sort = b.dataset.psort;
  renderPeople();
});
function openPerson(name) {
  const p = personByName[name];
  if (!p) return;
  const vids = p.videos.map((id) => videoById[id]).filter(Boolean).sort((a, b) => (b.views || 0) - (a.views || 0));
  const met = {};
  for (const v of vids) for (const n of v.people) if (n !== p.name && personByName[n]) met[n] = (met[n] || 0) + 1;
  const opponents = Object.entries(met).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n]) => n);
  const formats = [...new Set(vids.map((v) => formatName(v.format)))];
  modal(`<div class="modal__body" style="padding-top:28px">
    <div style="display:flex;gap:16px;align-items:center">${avatar(p, 'avatar--xl')}<div><span class="badge-format">${esc(p.role || D.parties.find((x) => x.id === p.party)?.name || 'Profil')}</span><h3 class="display" style="font-size:clamp(1.8rem,4vw,3rem)">${esc(p.name)}</h3></div></div>
    <div class="statrow"><div><strong>${vids.length}</strong><span>avsnitt</span></div><div><strong>${compact(p.views)}</strong><span>visningar</span></div><div><strong>${formats.length}</strong><span>format</span></div><div><strong>${opponents.length}</strong><span>motdebattörer</span></div></div>
    <p class="muted" style="margin:0">Har medverkat i ${esc(formats.join(', '))}.</p>
    <h4 style="margin:12px 0 0">Avsnitt</h4>
    <div class="mgrid">${vids.map(miniCard).join('')}</div>
    ${opponents.length ? `<h4 style="margin:12px 0 0">Har debatterat mot</h4><div class="chips">${opponents.map((n) => `<button class="chip" type="button" data-person="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    <p><button class="btn btn--sm" type="button" data-apply="">Vill du möta ${esc(p.name.split(' ')[0])}? Anmäl dig →</button></p>
  </div>`, { label: p.name });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-person]');
  if (!el) return;
  e.preventDefault();
  const hadModal = !!document.querySelector('.modal');
  document.querySelector('.modal .modal__close')?.click();
  setTimeout(() => openPerson(el.dataset.person), hadModal ? 260 : 0);
});

/* ---------- om oss ---------- */
$('#aboutLead').textContent = site.about?.lead || '';
$('#aboutStory').innerHTML = (site.about?.story || []).map((p) => `<p>${esc(p)}</p>`).join('');
$('#why').innerHTML = (site.about?.why || []).map((w) => `<div class="card"><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p></div>`).join('');
$('#timeline').innerHTML = (D.timeline || []).map(([t, x]) => `<li><strong>${esc(t)}</strong><p>${esc(x)}</p></li>`).join('');
$('#team').innerHTML = (site.team || []).map((m) => `
  <article class="card member">
    <div class="member__mono" aria-hidden="true">${esc(initials(m.name))}</div>
    <h3>${esc(m.name)}</h3>
    <p class="member__role">${esc(m.role)}</p>
    <p>${esc(m.bio)}</p>
    ${m.instagram ? `<a class="link" href="${esc(m.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>` : ''}
  </article>`).join('');
const q = D.quotes?.[0];
if (q) $('#quote').innerHTML = `<blockquote>”${esc(q.text)}”</blockquote><figcaption>— ${esc(q.by)}, ${esc(q.source)}</figcaption>`;
else $('#quote').remove();

/* ---------- press ---------- */
$('#facts').innerHTML = `<tbody>${[
  ['Grundare', 'Simon Claesson och Emil Widén'], ['Startade på YouTube', dateSv(D.joined, { day: 'numeric', month: 'long', year: 'numeric' })],
  ['Prenumeranter', num(D.stats.subscribers)], ['Visningar totalt', num(D.stats.views)], ['Videor', `${num(D.stats.videos)}${D.shorts ? ` (varav ${D.shorts} Shorts)` : ''}`],
  ['Största avsnittet', `${num(D.stats.topViews)} visningar`], ['Format', formatsWithEpisodes.map((f) => f.name).join(', ')], ['Kanaler', 'YouTube, TikTok, Instagram'],
].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>`;
$('#ytcomment').innerHTML = `<span class="avatar">S</span><div><small>@Stanne-mp6lp · kommentar på YouTube</small><p>${esc(D.channel.bannerQuote)}</p><div class="likes"><span>👍 2</span><span>Svara</span></div></div>`;
$('#pressList').innerHTML = (D.press || []).map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener"><div><strong>${esc(p.outlet)}</strong><span>${esc(p.title)}</span></div><span aria-hidden="true">↗</span></a>`).join('');
const ASSETS = [['s3-logo.svg', 'S3-logga (orange)'], ['s3-logo-currentcolor.svg', 'S3-logga (enfärgad)'], ['studio3-wordmark.svg', 'STUDIO 3. – ordmärke'], ['studio-soffan.svg', 'Studio Soffan'], ['duellen.svg', 'Duellen'], ['20-vs-1.svg', '20 VS 1'], ['panelen.svg', 'Panelen'], ['valvakan.svg', 'Valvakan']];
$('#assets').innerHTML = ASSETS.map(([f, l]) => `<a class="asset" href="../public/assets/img/logos/${f}" download><span class="asset__img"${f.includes('currentcolor') ? ' style="background:#f1f1f1"' : ''}><img src="../public/assets/img/logos/${f}" alt=""></span><span>${l}</span><small>SVG ↓</small></a>`).join('');
$('#swatches').innerHTML = [['#F1944F', 'Studio 3-orange'], ['#0F0F0F', 'Studiosvart'], ['#FFFFFF', 'Vit']].map(([c, n]) => `<div><i style="background:${c}"></i><strong>${n}</strong><span>${c}</span></div>`).join('');

/* ---------- samarbeten ---------- */
$('#partnerTitle').textContent = site.partner?.title || '';
$('#partnerText').textContent = site.partner?.text || '';
$('#kpis').innerHTML = [
  [num(D.stats.subscribers), 'prenumeranter'], [`${(D.stats.views / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mn`, 'visningar'],
  [num(D.stats.topViews), 'visningar, toppavsnitt'], [String(D.people.length), 'profiler i stolen'],
].map(([a, b]) => `<div><strong>${a}</strong>${b}</div>`).join('');
$('#offers').innerHTML = (site.partner?.offers || []).map((o) => `<div class="card"><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p></div>`).join('');
$('#partnerExample').textContent = D.partnerExample || '';
$('#partnerProcess').innerHTML = (D.partnerProcess || []).map(([t, x]) => `<li><strong>${esc(t)}</strong><p>${esc(x)}</p></li>`).join('');
$('#leadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = $('.form-status', form);
  const btn = $('button[type="submit"]', form);
  btn.disabled = true;
  status.className = 'form-status';
  status.textContent = 'Skickar…';
  try {
    await api('/api/public/leads', { method: 'POST', body: formJson(form) });
    form.reset();
    showErrors(form, {});
    status.className = 'form-status ok';
    status.textContent = 'Tack! Vi återkommer inom två arbetsdagar.';
  } catch (err) {
    showErrors(form, err.fields);
    status.className = 'form-status err';
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- nyhetsbrev ---------- */
$('#n-county').insertAdjacentHTML('beforeend', D.counties.map((c) => `<option>${esc(c)}</option>`).join(''));
$('#newsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = $('.form-status', form);
  const btn = $('button[type="submit"]', form);
  btn.disabled = true;
  try {
    const r = await api('/api/public/subscribe', { method: 'POST', body: { ...formJson(form), source: 'startsida' } });
    showErrors(form, {});
    status.className = 'form-status ok';
    status.textContent = r.status === 'already' ? 'Du prenumererar redan – dina val är uppdaterade.' : 'Nästan klart! Kolla din inkorg och bekräfta.';
    form.reset();
  } catch (err) {
    showErrors(form, err.fields);
    status.className = 'form-status err';
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
const nl = new URLSearchParams(location.search).get('nyhetsbrev');
if (nl) toast({ bekraftad: 'Tack! Din prenumeration är bekräftad.', avslutad: 'Du är avregistrerad från nyhetsbrevet.', ogiltig: 'Länken är ogiltig eller har redan använts.' }[nl] || '');

if (site.swish) {
  const s = $('#swish');
  s.hidden = false;
  s.innerHTML = `<div><h3>Stötta STUDIO 3</h3><p class="muted" style="margin:6px 0 0">Vill du hjälpa oss göra fler debatter? Swisha valfritt belopp.</p></div><strong>${esc(site.swish)}</strong>`;
}

/* ---------- kontakt ---------- */
const soc = site.socials || {};
$('#contactCards').innerHTML = [
  `<button class="card card--link" type="button" data-apply=""><h3>Vill vara med</h3><p>Sök till en debatt eller anmäl dig till talangbanken.</p><span class="link">Anmäl dig →</span></button>`,
  `<a class="card card--link" href="#samarbeten"><h3>Samarbeten &amp; event</h3><p>Sponsring, livedebatter, föreläsningar och egna serier.</p><span class="link">Skicka förfrågan →</span></a>`,
  `<a class="card card--link" href="#press"><h3>Press</h3><p>Fakta, loggor och pressklipp – och intervjuförfrågningar.</p><span class="link">Till press →</span></a>`,
  `<div class="card"><h3>Följ oss</h3><p class="muted">${[[soc.youtube, 'YouTube'], [soc.tiktok, 'TikTok'], [soc.instagramSimon, 'Instagram – Simon'], [soc.instagramEmil, 'Instagram – Emil']].filter(([h]) => h).map(([h, l]) => `<a class="link" href="${esc(h)}" target="_blank" rel="noopener">${l} ↗</a>`).join('<br>')}</p>${site.contactEmail ? `<p><a class="link" href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>` : ''}</div>`,
].join('');

/* ---------- footer ---------- */
$('#socials').innerHTML = [
  soc.youtube && `<li><a href="${esc(soc.youtube)}" target="_blank" rel="noopener">YouTube</a></li>`,
  soc.tiktok && `<li><a href="${esc(soc.tiktok)}" target="_blank" rel="noopener">TikTok</a></li>`,
  soc.instagramSimon && `<li><a href="${esc(soc.instagramSimon)}" target="_blank" rel="noopener">Instagram – Simon</a></li>`,
  soc.instagramEmil && `<li><a href="${esc(soc.instagramEmil)}" target="_blank" rel="noopener">Instagram – Emil</a></li>`,
].filter(Boolean).join('');
$('#year').textContent = new Date().getFullYear();

// Öppna rätt lager direkt från en delad länk, t.ex. #sok
if (location.hash === '#sok') openApply('');
styleBar();
