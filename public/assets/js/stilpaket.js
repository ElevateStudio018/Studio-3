import { THEMES, themeVars, fontsHref, isLight } from './themes.js';
import { $, esc, toast } from './common.js';

const active = document.documentElement.dataset.theme;
let loggedIn = false;
try {
  const r = await fetch('/api/admin/me');
  loggedIn = r.ok;
} catch { /* inte inloggad */ }

// Ladda alla paketens typsnitt
for (const t of THEMES) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = fontsHref(t);
  document.head.appendChild(l);
}

const covers = ['2D3DJt9OJxo', 'R90i6AIv3zw', 'dh-BWEvy2wE', 'EggtcghwlAA', 'qWp6O2RULRI', 'VXzihX-9ocM', 'j_U6t12ZSdw', 'B1IAy3WvnXg', 'yDF-JtVWPl4', 'wWOaROItj-o'];

$('#grid').innerHTML = THEMES.map((t, i) => {
  const vars = Object.entries(themeVars(t)).map(([k, v]) => `${k}:${v}`).join(';');
  const sw = ['bg', 'surface', 'text', 'accent', 'accent2'].map((k) => `<i style="background:${t.vars[k]}" title="${k}: ${t.vars[k]}"></i>`).join('');
  const fam = (s) => s.split(',')[0].replace(/"/g, '');
  return `<article class="sp__card ${t.id === active ? 'is-active' : ''}" id="${t.id}">
    <div class="mini" style="${esc(vars)}" data-theme="${t.id}" data-tone="${isLight(t) ? 'light' : 'dark'}" data-fx="${t.fx.join(' ')}">
      <div class="mini__hero">
        <img src="https://i.ytimg.com/vi/${covers[i % covers.length]}/hqdefault.jpg" alt="" loading="lazy">
        <div>
          <svg class="mini__logo" viewBox="0 0 1025 452" aria-hidden="true"><use href="#s3logo"/></svg>
          <div class="mini__h">Debatten<span>börjar här.</span></div>
          <span class="mini__btn">Sök till en debatt →</span>
        </div>
      </div>
      <div class="mini__body">
        <div class="mini__card"><div class="mini__chips"><span>1 mot 20</span><span>Studio Soffan</span><span>Duellen</span></div><b>Partiledare vs 20 väljare</b><small>Vi söker 20 väljare · 13 dagar kvar</small></div>
      </div>
    </div>
    <div class="sp__meta">
      <h2 class="display">${esc(t.name)} <small>#${String(i + 1).padStart(2, '0')}</small></h2>
      <p>${esc(t.tagline)}</p>
      <p><strong style="color:var(--text)">Passar för:</strong> ${esc(t.bestFor)}</p>
      <div class="sp__swatches">${sw}</div>
      <div class="sp__fonts">Rubriker: <b>${esc(fam(t.display))}</b> · Brödtext: <b>${esc(fam(t.body))}</b>${t.fx.length ? ` · Effekter: ${esc(t.fx.join(', '))}` : ''}</div>
      <div class="sp__actions">
        <a class="btn btn--sm" href="/?stil=${t.id}">Förhandsgranska</a>
        ${loggedIn ? `<button class="btn btn--ghost btn--sm" type="button" data-activate="${t.id}">${t.id === active ? 'Aktivt' : 'Aktivera'}</button>` : ''}
      </div>
    </div>
  </article>`;
}).join('');

const current = THEMES.find((t) => t.id === active);
$('#current').innerHTML = current ? `<span class="chip chip--accent">Aktivt nu: ${esc(current.name)}</span>` : '';

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-activate]');
  if (!b) return;
  const r = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'studio3' }, body: JSON.stringify({ theme: b.dataset.activate }) });
  if (r.ok) {
    toast('Stilpaketet är aktiverat på hela sajten.');
    setTimeout(() => location.reload(), 900);
  } else toast('Kunde inte aktivera – är du inloggad?');
});
