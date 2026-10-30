import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config } from './server/config.js';
import { get, all, getSetting, setSetting, track } from './server/db.js';
import { createRouter, json, send, serveFile, HttpError } from './server/http.js';
import { securityHeaders } from './server/security.js';
import { seed } from './server/seed.js';
import { syncYoutube } from './server/youtube.js';
import { registerPublic, bootstrap, debateOut, isOpen } from './server/routes/public.js';
import { registerAdmin, retentionSweep, announceVideos } from './server/routes/admin.js';
import { getTheme, themeCss, fontsHref, isLight, THEMES } from './public/assets/js/themes.js';
import { escapeHtml } from './server/mailer.js';
import { renderSubpage, subpageRoutes } from './server/pages.js';

seed();

const router = createRouter();
registerPublic(router);
registerAdmin(router);

// ---------- sidor med serverinjicerat stilpaket, metadata och startdata ----------
const PAGES = {
  '/': 'index.html',
  '/sok': 'sok.html',
  '/stilpaket': 'stilpaket.html',
  '/integritet': 'integritet.html',
  '/admin': 'admin/index.html',
};
const templateCache = new Map();
function template(file) {
  if (process.env.NODE_ENV === 'production' && templateCache.has(file)) return templateCache.get(file);
  const html = fs.readFileSync(path.join(config.publicDir, file), 'utf8');
  templateCache.set(file, html);
  return html;
}
const ASSET_VERSION = Date.now().toString(36);
// Studio 3-loggan som återanvändbar SVG-symbol (<svg><use href="#s3logo"/></svg>)
const LOGO_SYMBOL = (() => {
  const svg = fs.readFileSync(path.join(config.publicDir, 'assets/img/logos/s3-logo.svg'), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const d = svg.match(/ d="([^"]+)"/)[1];
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="s3logo" viewBox="${viewBox}"><path fill="currentColor" fill-rule="evenodd" d="${d}"/></symbol></svg>`;
})();
const safeJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function renderPage(req, res, file, { meta = {}, data, status = 200, body } = {}) {
  const site = getSetting('site', {});
  const url = new URL(req.url, config.siteUrl);
  const preview = url.searchParams.get('stil');
  const theme = getTheme(THEMES.some((t) => t.id === preview) ? preview : site.theme);
  const title = meta.title || `${site.name || 'STUDIO 3'} – ${site.endline || 'Debatten börjar här.'}`;
  const description = meta.description || site.subline || '';
  const image = meta.image || `${config.siteUrl}/assets/img/og.jpg`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${config.siteUrl}${url.pathname}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="STUDIO 3"><meta property="og:locale" content="sv_SE">`,
    `<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}"><meta property="og:url" content="${config.siteUrl}${url.pathname}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="theme-color" content="${theme.vars.bg}">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link id="theme-fonts" rel="stylesheet" href="${fontsHref(theme)}">`,
    `<style id="theme-vars">${themeCss(theme, "html:root")}</style>`,
    data ? `<script type="application/json" id="bootstrap">${safeJson(data)}</script>` : '',
    meta.jsonLd ? `<script type="application/ld+json">${safeJson(meta.jsonLd)}</script>` : '',
  ].join('\n  ');
  // Ersätt med funktioner så att $-tecken i innehållet aldrig tolkas som mönster
  const html = template(file)
    .replace('<html lang="sv">', () => `<html lang="sv"${url.searchParams.get('embed') === '1' ? ' class="embed"' : ''} data-theme="${theme.id}" data-tone="${isLight(theme) ? 'light' : 'dark'}" data-fx="${theme.fx.join(' ')}">`)
    .replace('<!--HEAD-->', () => head)
    .replace('<!--LOGO-->', () => LOGO_SYMBOL)
    .replace('<!--BODY-->', () => body || '')
    .replace(/\?v=ASSET/g, `?v=${ASSET_VERSION}`);
  send(res, status, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
}

function orgJsonLd(data) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'STUDIO 3',
    url: config.siteUrl,
    logo: `${config.siteUrl}/assets/img/logos/s3-logo.svg`,
    description: data.site.subline,
    founder: (data.site.team || []).slice(0, 2).map((p) => ({ '@type': 'Person', name: p.name })),
    sameAs: Object.values(data.site.socials || {}).filter(Boolean),
  };
}

function handlePage(req, res, pathname) {
  if (pathname === '/') {
    const data = bootstrap();
    return renderPage(req, res, 'index.html', { data, meta: { jsonLd: orgJsonLd(data) } });
  }
  const m = pathname.match(/^\/sok(?:\/([^/]+))?\/?$/);
  if (m) {
    const data = bootstrap();
    let meta = { title: 'Sök till STUDIO 3 – var med i nästa debatt' , description: 'Anmäl dig till STUDIO 3:s talangbank eller sök till en öppen debatt.' };
    if (m[1]) {
      const d = get("SELECT * FROM debates WHERE slug = ? AND status != 'draft'", m[1]);
      if (!d) return renderPage(req, res, '404.html', { status: 404 });
      data.debate = { ...debateOut(d), open: isOpen(d) };
      meta = { title: `Sök till ${d.title} | STUDIO 3`, description: d.summary || d.statement || '', image: d.cover_url || undefined };
    }
    return renderPage(req, res, 'sok.html', { data, meta });
  }
  if (pathname === '/stilpaket') return renderPage(req, res, 'stilpaket.html', { meta: { title: '20 stilpaket för STUDIO 3' } });
  if (pathname === '/integritet') return renderPage(req, res, 'integritet.html', { meta: { title: 'Integritetspolicy | STUDIO 3' } });
  if (pathname === '/admin' || pathname === '/admin/') return renderPage(req, res, 'admin/index.html', { meta: { title: 'Admin | STUDIO 3' } });
  const sub = renderSubpage(pathname.replace(/\/$/, '') || '/');
  if (sub) return renderPage(req, res, 'page.html', { body: sub.body, meta: { title: sub.title, description: sub.description, image: sub.image, jsonLd: sub.jsonLd } });
  return false;
}

function sitemap() {
  const urls = ['/', '/sok', '/integritet', ...subpageRoutes(), ...all("SELECT slug FROM debates WHERE status = 'open'").map((d) => `/sok/${d.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${config.siteUrl}${u.split('/').map(encodeURIComponent).join('/')}</loc></url>`).join('\n')}\n</urlset>\n`;
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let url;
  let pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Ogiltig adress', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  try {
    const match = router.match(req.method, url.pathname);
    if (match) {
      for (const h of match.handlers) await h(req, res, { params: match.params, query: url.searchParams });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metoden stöds inte.');
    if (pathname === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain' });
    if (pathname === '/sitemap.xml') return send(res, 200, sitemap(), { 'Content-Type': 'application/xml' });
    if (pathname === '/health') return json(res, 200, { ok: true });
    if (pathname.startsWith('/api/')) throw new HttpError(404, 'Hittades inte.');
    if (handlePage(req, res, pathname) !== false) {
      if (pathname === '/') track('view_home');
      return;
    }
    // Statiska filer (inga dolda filer, ingen katalogvandring)
    const file = path.join(config.publicDir, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(config.publicDir) && !/\/\./.test(pathname) && !pathname.endsWith('.html')) {
      const cache = pathname.startsWith('/assets/video/') ? 'public, max-age=86400' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
      if (serveFile(req, res, file, { cache })) return;
    }
    renderPage(req, res, '404.html', { status: 404 });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (pathname.startsWith('/api/') || pathname.startsWith('/nyhetsbrev/')) json(res, status, { error: status === 500 ? 'Något gick fel. Försök igen.' : err.message, fields: err.details });
    else send(res, status, status === 500 ? 'Serverfel' : err.message, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
});

// ---------- bakgrundsjobb ----------
async function runSync() {
  if (config.youtube.disabled) return;
  try {
    const fresh = await syncYoutube();
    if (fresh.length) {
      console.log(`YouTube: ${fresh.length} nya videor`);
      if (getSetting('site', {}).autoNotifyVideos) announceVideos(fresh);
    }
  } catch (err) {
    setSetting('youtubeSync', { at: new Date().toISOString(), ok: false, error: String(err.message || err) });
    console.warn('YouTube-synk misslyckades:', err.message);
  }
}
setTimeout(runSync, 5_000).unref();
setInterval(runSync, config.youtube.syncMinutes * 60_000).unref();
setInterval(retentionSweep, 6 * 3600_000).unref();
retentionSweep();

server.listen(config.port, config.host, () => {
  console.log(`STUDIO 3 körs på ${config.siteUrl}  (admin: ${config.siteUrl}/admin)`);
});


