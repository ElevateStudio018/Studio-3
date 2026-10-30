import { $, $$, esc, bootstrapData, dateSv, timeSv, daysLeft, thumb, api, track, toast, showErrors, styleBar } from './common.js';

// Inbäddad som lager ovanpå startsidan (?embed=1): ingen egen header, länkar hem stänger lagret
const EMBED = new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window;
if (EMBED) {
  document.documentElement.classList.add('embed');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === '/' || href.startsWith('/#') || href === 'index.html' || href.startsWith('index.html#')) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ s3: 'close-apply', hash: href.split('#')[1] || '' }, location.origin);
    }
  }, true);
}

const D = bootstrapData();
const debate = D.debate || null;
const form = $('#applyForm');
const DRAFT_KEY = `s3-ansokan-${debate?.slug || 'talangbank'}`;
const PARTY_COLORS = { S: '#e8112d', M: '#52bdec', SD: '#dddd00', V: '#da291c', C: '#009933', KD: '#1b3a8c', L: '#006ab3', MP: '#83cf39' };
const FORMAT_LOGO = { '1vs20': '20-vs-1.svg', partiledare: '20-vs-1.svg', soffan: 'studio-soffan.svg', duellen: 'duellen.svg', panelen: 'panelen.svg', valvakan: 'valvakan.svg' };
const startedAt = Date.now();
let step = 1;
let photoData = null;

track('view_apply');

/* ---------- informationskolumnen ---------- */
function renderInfo() {
  const info = $('#info');
  if (!debate) {
    info.innerHTML = `
      <div class="apply__art"><img src="../public/assets/video/hero-poster.jpg" alt=""><svg class="logo" viewBox="0 0 1025 452" style="color:var(--accent)" aria-hidden="true"><use href="#s3logo"/></svg></div>
      <span class="badge-format">Talangbanken</span>
      <h1>Vill du vara med i STUDIO 3?</h1>
      <p class="apply__desc">Anmäl dig till vår talangbank. Varje gång vi planerar en debatt letar vi först här efter rätt personer – oavsett om det gäller 1 mot 20, Studio Soffan, Duellen eller publik till en livedebatt.</p>
      <div class="debate__needs"><div class="need"><span>Alla åldrar över 18</span><strong>✓</strong></div><div class="need"><span>Alla partier – och de utan parti</span><strong>✓</strong></div><div class="need"><span>Hela Sverige</span><strong>✓</strong></div></div>`;
    return;
  }
  const f = D.formats.find((x) => x.key === debate.format);
  const art = debate.cover_url || (f?.top ? thumb(f.top, 'maxresdefault') : '../public/assets/video/hero-poster.jpg');
  const logo = FORMAT_LOGO[debate.format];
  const left = daysLeft(debate.deadline);
  info.innerHTML = `
    <div class="apply__art"><img src="${esc(art)}" alt="">${logo && debate.cover_url ? `<img class="logo ${logo === 'studio-soffan.svg' ? 'round' : ''}" src="../public/assets/img/logos/${logo}" alt="${esc(debate.formatName)}">` : ''}</div>
    <span class="badge-format">${esc(debate.formatName)}</span>
    <h1>${esc(debate.title)}</h1>
    ${debate.statement ? `<p class="debate__statement">”${esc(debate.statement)}”</p>` : ''}
    <dl class="debate__meta">
      ${debate.event_at ? `<div><dt>Inspelning</dt><dd>${dateSv(debate.event_at, { weekday: 'short', day: 'numeric', month: 'long' })}${timeSv(debate.event_at) ? `, ${timeSv(debate.event_at)}` : ''}</dd></div>` : ''}
      ${debate.location ? `<div><dt>Plats</dt><dd>${esc(debate.location)}</dd></div>` : ''}
      ${debate.deadline ? `<div><dt>Sök senast</dt><dd>${dateSv(debate.deadline)}${left != null && left >= 0 ? ` (${left <= 0 ? 'i dag' : `${left} d kvar`})` : ''}</dd></div>` : ''}
    </dl>
    ${debate.description ? `<p class="apply__desc">${esc(debate.description)}</p>` : ''}
    ${debate.needs?.length ? `<div class="debate__needs"><span class="muted" style="font-size:.85rem;font-weight:700">VI SÖKER</span>${debate.needs.map((n) => `<div class="need"><span>${esc(n.label)}</span><strong>${n.count ? `${n.count} st` : ''}</strong></div>`).join('')}</div>` : ''}
    ${debate.applicants >= 10 ? `<p class="muted" style="margin:0">🔥 ${debate.applicants} personer har redan sökt.</p>` : ''}
    ${!debate.open ? `<div class="apply__closed"><strong>Ansökan har stängt.</strong><br>Anmäl dig till <a class="link" href="/sok">talangbanken</a> eller <a class="link" href="/#nyhetsbrev">bevaka nya debatter</a>.</div>` : ''}`;
}
renderInfo();

if (debate && !debate.open) {
  form.hidden = true;
  $('#progress').hidden = true;
}

/* ---------- fält som beror på data ---------- */
$('#county').insertAdjacentHTML('beforeend', D.counties.map((c) => `<option>${esc(c)}</option>`).join(''));
$('#parties').innerHTML = D.parties.map((p) => `<label><input type="radio" name="party" value="${p.id}"><span style="--c:${PARTY_COLORS[p.id] || 'var(--muted)'}"><i></i>${esc(p.name)}</span></label>`).join('');

if (debate?.statement) {
  $('#stanceField').hidden = false;
  $('#stanceStatement').textContent = `”${debate.statement}”`;
}
if (debate?.needs?.length) {
  $('#needsField').hidden = false;
  $('#needs').innerHTML = debate.needs.map((n, i) => `<label data-i="${i}"><input type="radio" name="need_label" value="${esc(n.label)}"><span>${esc(n.label)}<em>${n.count ? `${n.count} platser` : ''}</em></span></label>`).join('');
}
if (debate?.questions?.length) {
  $('#customQuestions').innerHTML = debate.questions.map((q) => {
    const name = `answers.${q.id}`;
    const label = `${esc(q.label)}${q.required ? '' : ' <span class="hint">(valfritt)</span>'}`;
    if (q.type === 'textarea') return `<div class="field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}"></textarea></div>`;
    if (q.type === 'select') return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}"><option value="">Välj</option>${(q.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>`;
    if (q.type === 'yesno') return `<div class="field" data-field="${name}"><span class="label">${label}</span><div class="scale scale--3"><label><input type="radio" name="${name}" value="Ja"><span>Ja</span></label><label><input type="radio" name="${name}" value="Nej"><span>Nej</span></label></div></div>`;
    return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="text"></div>`;
  }).join('');
}
if (debate?.audience_seats > 0) {
  $('#kindToggle').hidden = false;
  $$('#kindToggle input').forEach((r) => r.addEventListener('change', () => { updateKind(); renderProgress(); }));
}
$('#availabilityField').hidden = !debate?.event_at;

$('#office').addEventListener('change', (e) => ($('#officeDetailField').hidden = !e.target.value));
$('#media_experience').addEventListener('change', (e) => ($('#mediaDetailField').hidden = !e.target.checked));
const motCounter = () => {
  const n = $('#motivation').value.trim().length;
  $('#motCounter').textContent = n < 30 ? `${n} / minst 30 tecken` : `${n} tecken ✓`;
};
$('#motivation').addEventListener('input', motCounter);

/* ---------- politisk kompass ---------- */
const compass = $('#compass');
const dot = $('#compassDot');
function setCompass(econ, social, save = true) {
  if (econ == null || social == null || econ === '' || social === '') {
    dot.hidden = true;
    $('#econ').value = '';
    $('#social').value = '';
    $('#compassRead').textContent = 'Klicka eller dra i rutan.';
    compass.setAttribute('aria-valuetext', 'Inte angivet');
  } else {
    econ = Math.max(-10, Math.min(10, Math.round(econ)));
    social = Math.max(-10, Math.min(10, Math.round(social)));
    dot.hidden = false;
    dot.style.left = `${((econ + 10) / 20) * 100}%`;
    dot.style.top = `${((social + 10) / 20) * 100}%`;
    $('#econ').value = econ;
    $('#social').value = social;
    const lr = econ <= -6 ? 'Vänster' : econ <= -2 ? 'Mitten-vänster' : econ < 2 ? 'Mitten' : econ < 6 ? 'Mitten-höger' : 'Höger';
    const gt = social <= -5 ? 'tydligt liberal (GAL)' : social < -1 ? 'liberal' : social <= 1 ? 'varken GAL eller TAN' : social < 5 ? 'konservativ' : 'tydligt konservativ (TAN)';
    $('#compassRead').textContent = `${lr}, ${gt}`;
    compass.setAttribute('aria-valuetext', `${lr}, ${gt}`);
  }
  if (save) saveDraft();
}
function fromPointer(e) {
  const r = compass.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 20 - 10;
  const y = ((e.clientY - r.top) / r.height) * 20 - 10;
  setCompass(x, y);
}
compass.addEventListener('pointerdown', (e) => {
  compass.setPointerCapture(e.pointerId);
  fromPointer(e);
  const move = (ev) => fromPointer(ev);
  compass.addEventListener('pointermove', move);
  compass.addEventListener('pointerup', () => compass.removeEventListener('pointermove', move), { once: true });
});
compass.addEventListener('keydown', (e) => {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const econ = $('#econ').value === '' ? 0 : +$('#econ').value;
  const social = $('#social').value === '' ? 0 : +$('#social').value;
  setCompass(econ + d[0], social + d[1]);
});
$('#compassClear').addEventListener('click', () => setCompass(null, null));

/* ---------- föreslå grupp utifrån parti/ståndpunkt ---------- */
function suggestNeed() {
  if (!debate?.needs?.length) return;
  const party = form.party?.value;
  const stance = Number(form.querySelector('[name="stance"]:checked')?.value ?? NaN);
  $$('#needs label').forEach((l) => {
    const n = debate.needs[l.dataset.i];
    const fits = (n.parties?.length && party && n.parties.includes(party)) || (n.stance === 'for' && stance > 0) || (n.stance === 'emot' && stance < 0);
    l.classList.toggle('suggested', !!fits);
    if (fits && !form.querySelector('[name="need_label"]:checked')) l.querySelector('input').checked = true;
  });
}
form.addEventListener('change', (e) => { if (['party', 'stance'].includes(e.target.name)) suggestNeed(); });

/* ---------- foto (förminskas i webbläsaren) ---------- */
$('#photoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Välj en bildfil.');
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    photoData = c.toDataURL('image/jpeg', 0.82);
    $('#photoPreview').src = photoData;
    $('#photoPreview').hidden = false;
    $('#photoRemove').hidden = false;
    $('#photoPick span').textContent = '📸 Byt bild';
  } catch {
    toast('Bilden kunde inte läsas. Prova en JPG eller PNG.');
  }
});
$('#photoRemove').addEventListener('click', () => {
  photoData = null;
  $('#photoInput').value = '';
  $('#photoPreview').hidden = true;
  $('#photoRemove').hidden = true;
  $('#photoPick span').textContent = '📸 Välj en bild';
});

/* ---------- steg ---------- */
const kind = () => form.querySelector('[name="kind"]:checked')?.value || 'deltagare';
const steps = () => (kind() === 'publik' ? [1, 4] : [1, 2, 3, 4]);
const STEP_NAMES = { 1: 'Om dig', 2: 'Politik', 3: 'Din röst', 4: 'Skicka' };
function renderProgress() {
  const list = steps();
  $('#progress').style.setProperty('--steps', list.length);
  $('#progress').innerHTML = list.map((s, i) => `<li class="${s === step ? 'is-current' : list.indexOf(step) > i ? 'is-done' : ''}" ${s === step ? 'aria-current="step"' : ''}><span>${i + 1}. ${STEP_NAMES[s]}</span></li>`).join('');
}
function updateKind() {
  const pub = kind() === 'publik';
  $('#consentPolitical').hidden = pub;
  $('#availabilityLabel').textContent = pub ? 'Kan du komma på inspelningen?' : 'Kan du delta vid inspelningen?';
  if (pub && (step === 2 || step === 3)) showStep(4);
}
function showStep(n, focus = true) {
  step = n;
  $$('.step-panel').forEach((p) => (p.hidden = Number(p.dataset.step) !== n));
  const list = steps();
  $('#prevBtn').hidden = list.indexOf(n) === 0;
  $('#nextBtn').hidden = n === 4;
  $('#submitBtn').hidden = n !== 4;
  if (n === 4) renderSummary();
  renderProgress();
  if (n > 1) track(`apply_step_${n}`);
  if (focus) {
    $('.apply__main').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $(`.step-panel[data-step="${n}"] legend`)?.setAttribute('tabindex', '-1');
    $(`.step-panel[data-step="${n}"] legend`)?.focus({ preventScroll: true });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validate(n) {
  const v = collect();
  const e = {};
  if (n === 1) {
    if (v.name.trim().length < 2) e.name = 'Skriv ditt namn.';
    if (!EMAIL_RE.test(v.email.trim())) e.email = 'Ange en giltig e-postadress.';
    if (v.phone.replace(/\D/g, '').length < 7) e.phone = 'Ange ett telefonnummer.';
    const age = new Date().getFullYear() - Number(v.birth_year);
    if (!v.birth_year || age < 18 || age > 110) e.birth_year = age < 18 ? 'Du måste ha fyllt 18 år.' : 'Ange ditt födelseår.';
  }
  if (n === 2 && kind() === 'deltagare') {
    if (!v.party) e.party = 'Välj ett alternativ – du kan välja "Vill inte uppge".';
    if (debate?.statement && v.stance === '') e.stance = 'Välj vad du tycker.';
    if (debate?.needs?.length > 1 && !v.need_label) e.need_label = 'Välj grupp.';
  }
  if (n === 3 && kind() === 'deltagare') {
    if (v.motivation.trim().length < 30) e.motivation = 'Berätta lite mer (minst 30 tecken).';
    for (const q of debate?.questions || []) if (q.required && !v.answers[q.id]) e[`answers.${q.id}`] = 'Obligatorisk fråga.';
  }
  if (n === 4) {
    if (!v.consent_age) e.consent_age = 'Bekräfta att du har fyllt 18.';
    if (kind() === 'deltagare' && !v.consent_political) e.consent_political = 'Vi behöver ditt samtycke för att kunna hantera din ansökan.';
    if (!v.consent_media) e.consent_media = 'Vi behöver ditt godkännande.';
  }
  showErrors(form, e);
  return !Object.keys(e).length;
}

function collect() {
  const out = { socials: {}, answers: {} };
  for (const el of form.elements) {
    if (!el.name || el.type === 'file') continue;
    const val = el.type === 'checkbox' ? el.checked : el.type === 'radio' ? (el.checked ? el.value : undefined) : el.value;
    if (val === undefined) {
      if (!(el.name in out) && !el.name.includes('.')) out[el.name] = '';
      continue;
    }
    if (el.name.startsWith('socials.')) out.socials[el.name.slice(8)] = val;
    else if (el.name.startsWith('answers.')) out.answers[el.name.slice(8)] = val;
    else out[el.name] = val;
  }
  return out;
}

function renderSummary() {
  const v = collect();
  const party = D.parties.find((p) => p.id === v.party)?.name;
  const rows = [
    ['Namn', v.name], ['E-post', v.email], ['Telefon', v.phone], ['Född', v.birth_year], ['Ort', [v.municipality, v.county].filter(Boolean).join(', ')],
    kind() === 'deltagare' && ['Parti', party], kind() === 'deltagare' && ['Kompass', $('#econ').value !== '' ? $('#compassRead').textContent : 'Inte angivet'],
    debate?.statement && kind() === 'deltagare' && ['Ståndpunkt', form.querySelector('[name="stance"]:checked')?.nextElementSibling.textContent],
    v.need_label && ['Grupp', v.need_label], ['Bild', photoData ? 'Bifogad ✓' : 'Ingen'], kind() === 'publik' && ['Typ', 'Publikplats'],
  ].filter(Boolean).filter((r) => r[1]);
  $('#summary').innerHTML = `<strong style="margin-bottom:4px">Sammanfattning</strong>${rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}`;
}

$('#nextBtn').addEventListener('click', () => {
  if (!validate(step)) return;
  const list = steps();
  showStep(list[list.indexOf(step) + 1]);
});
$('#prevBtn').addEventListener('click', () => {
  const list = steps();
  showStep(list[list.indexOf(step) - 1]);
});

/* ---------- utkast ---------- */
let draftT;
function saveDraft() {
  clearTimeout(draftT);
  draftT = setTimeout(() => {
    try {
      const v = collect();
      delete v.hp;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ v, step, at: Date.now() }));
      $('#draftNote').textContent = 'Utkast sparat';
    } catch { /* privat läge */ }
  }, 400);
}
function restoreDraft() {
  let d;
  try {
    d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return;
  }
  if (!d || Date.now() - d.at > 14 * 864e5) return;
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.name === 'hp') continue;
    const val = el.name.startsWith('socials.') ? d.v.socials?.[el.name.slice(8)] : el.name.startsWith('answers.') ? d.v.answers?.[el.name.slice(8)] : d.v[el.name];
    if (val === undefined) continue;
    if (el.type === 'checkbox') el.checked = !!val;
    else if (el.type === 'radio') el.checked = el.value === String(val);
    else el.value = val;
  }
  setCompass(d.v.econ, d.v.social, false);
  $('#officeDetailField').hidden = !form.office.value;
  $('#mediaDetailField').hidden = !$('#media_experience').checked;
  motCounter();
  toast('Vi har återställt ditt sparade utkast.');
}
let started = false;
form.addEventListener('input', () => {
  if (!started) (started = true), track('apply_start');
  saveDraft();
});
form.addEventListener('change', saveDraft);

/* ---------- skicka ---------- */
const FIELD_STEP = { name: 1, email: 1, phone: 1, birth_year: 1, party: 2, stance: 2, need_label: 2, motivation: 3 };
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate(4)) return;
  const btn = $('#submitBtn');
  btn.disabled = true;
  $('#status').className = 'form-status';
  $('#status').textContent = 'Skickar din ansökan…';
  const v = collect();
  try {
    const r = await api('/api/public/applications', {
      method: 'POST',
      body: { ...v, debate: debate?.slug || null, kind: kind(), photo: photoData, t: Date.now() - startedAt, utm: new URLSearchParams(location.search).get('utm_source') || '' },
    });
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignoreras */ }
    showDone(r.ref, v.name);
  } catch (err) {
    $('#status').className = 'form-status err';
    $('#status').textContent = err.message;
    const fields = err.fields || {};
    const first = Object.keys(fields)[0];
    if (first) {
      const s = FIELD_STEP[first] || (first.startsWith('q_') || first.startsWith('answers.') ? 3 : 4);
      if (s !== step) showStep(s);
      const mapped = Object.fromEntries(Object.entries(fields).map(([k, m]) => [k.startsWith('q_') ? `answers.${k.slice(2)}` : k, m]));
      showErrors(form, mapped);
    }
  } finally {
    btn.disabled = false;
  }
});

function showDone(ref, name) {
  form.hidden = true;
  $('#progress').hidden = true;
  const done = $('#done');
  done.hidden = false;
  const shareUrl = location.origin + location.pathname;
  done.innerHTML = `
    <div class="done__check" aria-hidden="true">✓</div>
    <h2>Tack ${esc(name.split(' ')[0])}!</h2>
    <p class="lead" style="margin:0">Din ansökan är skickad. Vi har mejlat en bekräftelse.</p>
    <div class="done__ref" aria-label="Referensnummer">${esc(ref)}</div>
    <ol><li>Vi läser varje ansökan själva.</li><li>Om du går vidare ringer eller mejlar vi dig${debate?.deadline ? ` efter ${dateSv(debate.deadline)}` : ''}.</li><li>Under tiden: se våra debatter och prenumerera på YouTube.</li></ol>
    <div class="actions">
      <button class="btn" type="button" id="shareBtn">Dela debatten med en vän</button>
      <a class="btn btn--ghost" href="https://www.youtube.com/@studio3-se?sub_confirmation=1" target="_blank" rel="noopener">Prenumerera på YouTube ↗</a>
      <a class="btn btn--ghost" href="/">Till startsidan</a>
    </div>`;
  $('#shareBtn').addEventListener('click', async () => {
    track('share', false);
    const data = { title: debate ? `Sök till ${debate.title} – STUDIO 3` : 'Var med i STUDIO 3', url: shareUrl };
    if (navigator.share) return navigator.share(data).catch(() => {});
    await navigator.clipboard?.writeText(shareUrl);
    toast('Länken är kopierad!');
  });
  done.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

restoreDraft();
updateKind();
showStep(1, false);
styleBar();
