// Beteenden för undersidorna: meny, filter/sök/sortering i listor, spelare, delning och formulär.
import { $, $$, api, toast, showErrors, formJson, styleBar, track } from './common.js';

/* meny */
const menuBtn = $('#menuBtn');
menuBtn?.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuBtn.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});

/* listor: sök, filter och sortering utan omladdning */
for (const list of $$('[data-list]')) {
  const items = $$('[data-item]', list);
  const grid = items[0]?.parentElement;
  const state = { q: '', filters: {}, sort: $('[data-sort][aria-pressed="true"]', list)?.dataset.sort };
  const count = $('[data-count]', list);
  const sorters = {
    latest: (a, b) => Number(a.dataset.pos) - Number(b.dataset.pos),
    popular: (a, b) => Number(b.dataset.views) - Number(a.dataset.views),
    views: (a, b) => Number(b.dataset.views) - Number(a.dataset.views),
    count: (a, b) => Number(b.dataset.count) - Number(a.dataset.count) || Number(b.dataset.views) - Number(a.dataset.views),
    name: (a, b) => a.dataset.text.localeCompare(b.dataset.text, 'sv'),
  };
  const apply = () => {
    let shown = 0;
    for (const el of items) {
      const ok = (!state.q || el.dataset.text.includes(state.q)) && Object.entries(state.filters).every(([k, v]) => !v || el.dataset[k] === v);
      el.hidden = !ok;
      if (ok) shown++;
    }
    if (state.sort && sorters[state.sort] && grid) [...items].sort(sorters[state.sort]).forEach((el) => grid.appendChild(el));
    if (count) count.textContent = shown === items.length ? `${items.length} st` : `Visar ${shown} av ${items.length}`;
  };
  $('[data-search]', list)?.addEventListener('input', (e) => ((state.q = e.target.value.trim().toLowerCase()), apply()));
  for (const group of $$('[data-filter]', list)) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', group).forEach((x) => x.setAttribute('aria-pressed', x === b));
      state.filters[group.dataset.filter] = b.dataset.value;
      apply();
    });
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b) return;
    $$('[data-sort]', list).forEach((x) => x.setAttribute('aria-pressed', x === b));
    state.sort = b.dataset.sort;
    apply();
  });
  apply();
}

/* spelare: miniatyr tills man klickar (snabbare sida, inga cookies innan) */
function play(facade, start = 0) {
  const id = facade.dataset.player;
  track('video_click', false);
  facade.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&start=${start}" title="Spelare" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  facade.removeAttribute('role');
}
for (const f of $$('.yt-facade')) {
  f.addEventListener('click', () => f.querySelector('iframe') || play(f));
  f.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), play(f)));
}
document.addEventListener('click', (e) => {
  const seek = e.target.closest('[data-seek]');
  if (seek) {
    const f = $('.yt-facade');
    play(f, Number(seek.dataset.seek));
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const share = e.target.closest('[data-share]');
  if (share) {
    const data = { title: document.title, url: location.href };
    if (navigator.share) navigator.share(data).catch(() => {});
    else navigator.clipboard?.writeText(location.href).then(() => toast('Länken är kopierad!'));
  }
});

/* formulär */
for (const form of $$('form[data-form]')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('.form-status', form);
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Skickar…';
    try {
      if (form.dataset.form === 'lead') {
        await api('/api/public/leads', { method: 'POST', body: formJson(form) });
        status.textContent = 'Tack! Vi återkommer inom två arbetsdagar.';
      } else {
        const r = await api('/api/public/subscribe', { method: 'POST', body: { ...formJson(form), source: location.pathname } });
        status.textContent = r.status === 'already' ? 'Du prenumererar redan – dina val är uppdaterade.' : 'Nästan klart! Kolla din inkorg och bekräfta.';
      }
      showErrors(form, {});
      status.className = 'form-status ok';
      form.reset();
    } catch (err) {
      showErrors(form, err.fields);
      status.className = 'form-status err';
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

styleBar();
