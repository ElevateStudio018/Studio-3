// Delade hjälpfunktioner för de publika sidorna.
import { THEMES } from './themes.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function bootstrapData() {
  const el = document.getElementById('bootstrap');
  return el ? JSON.parse(el.textContent) : null;
}

const nf = new Intl.NumberFormat('sv-SE');
export const num = (n) => nf.format(n || 0);
export function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mn`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString('sv-SE')} tn`;
  return String(n || 0);
}
export const views = (n) => (n ? `${compact(n)} visningar` : '');
export function duration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
export function dateSv(iso, opts = { day: 'numeric', month: 'long' }) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d) ? '' : d.toLocaleDateString('sv-SE', opts);
}
export function timeSv(iso) {
  if (!iso || !iso.includes('T')) return '';
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
export function daysLeft(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - Date.now()) / 864e5);
}
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
export const ytUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || 'Något gick fel.');
    err.fields = data.fields || {};
    err.status = r.status;
    throw err;
  }
  return data;
}

const tracked = new Set();
export function track(event, once = true) {
  if (once && tracked.has(event)) return;
  tracked.add(event);
  try {
    const blob = new Blob([JSON.stringify({ event })], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/public/track', blob)) fetch('/api/public/track', { method: 'POST', body: blob, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch { /* statistik får aldrig störa */ }
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 4200);
}

export function showErrors(form, fields = {}) {
  $$('.has-error', form).forEach((el) => el.classList.remove('has-error'));
  $$('.error', form).forEach((el) => el.remove());
  let first = null;
  for (const [name, msg] of Object.entries(fields)) {
    const input = form.querySelector(`[name="${name}"]`) || form.querySelector(`[data-field="${name}"]`);
    if (!input) continue;
    const wrap = input.closest('.field, .check, [data-field]') || input.parentElement;
    wrap.classList.add('has-error');
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = msg;
    wrap.appendChild(p);
    first ??= input;
  }
  first?.focus?.({ preventScroll: false });
  return first;
}

export function formJson(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (form.querySelectorAll(`[name="${el.name}"]`).length > 1) (out[el.name] ||= []), el.checked && out[el.name].push(el.value);
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
      else out[el.name] ??= '';
    } else out[el.name] = el.value;
  }
  return out;
}

/** Avslöja element när de scrollas in. */
export function reveal(root = document) {
  const els = $$('.reveal:not(.is-in)', root);
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('is-in'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) (e.target.classList.add('is-in'), io.unobserve(e.target));
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}

/** Liten flytande bar när man förhandsgranskar ett stilpaket via ?stil=. */
export function styleBar() {
  const id = new URLSearchParams(location.search).get('stil');
  const i = THEMES.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = THEMES[i];
  const next = THEMES[(i + 1) % THEMES.length];
  const prev = THEMES[(i - 1 + THEMES.length) % THEMES.length];
  const bar = document.createElement('div');
  bar.className = 'stylebar';
  bar.innerHTML = `<span>Stilpaket ${i + 1}/20: <b>${esc(t.name)}</b></span>
    <a href="?stil=${prev.id}" aria-label="Föregående stilpaket">←</a><a href="?stil=${next.id}" aria-label="Nästa stilpaket">→</a><a href="/stilpaket">Alla 20</a>`;
  document.body.appendChild(bar);
  // Behåll förhandsvisningen när man klickar runt
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.closest('.stylebar') || a.href.includes('stil=') || a.getAttribute('href').startsWith('/admin')) return;
    const u = new URL(a.href);
    u.searchParams.set('stil', id);
    a.href = u.pathname + u.search + u.hash;
  });
}

export function modal(html, { onClose, label = 'Dialog' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', label);
  wrap.innerHTML = `<div class="modal__box"><button class="modal__close" type="button" aria-label="Stäng">×</button>${html}</div>`;
  const prevFocus = document.activeElement;
  const close = () => {
    wrap.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    setTimeout(() => wrap.remove(), 250);
    onClose?.();
    prevFocus?.focus?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => (e.target === wrap || e.target.closest('.modal__close')) && close());
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => wrap.classList.add('is-open'));
  wrap.querySelector('.modal__close').focus();
  return { el: wrap, close };
}

export const ICON = {
  youtube: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15.1V8.9L15.2 12l-5.4 3.1Z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2-2.8V9.1a6.3 6.3 0 1 0 5.4 6.3V8.7a7.8 7.8 0 0 0 4.4 1.4V6.7a4.5 4.5 0 0 1-4.4-4.7Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
};
