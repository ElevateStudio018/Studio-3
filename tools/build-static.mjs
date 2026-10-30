#!/usr/bin/env node
/**
 * Bygger en statisk demoversion av sajten i demo/ som kan visas utan server,
 * t.ex. via https://raw.githack.com/<ägare>/<repo>/<gren>/demo/index.html
 *
 * Startar servern mot en tillfällig databas med FIKTIV demodata, sparar de
 * renderade sidorna och en ögonblicksbild av admin-API:t. Bilder, video och
 * CSS läses direkt från public/ – bara HTML och JavaScript kopieras.
 *
 *   npm run build:demo
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'demo');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 's3-demo-'));
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, DATA_DIR: DATA, ADMIN_EMAIL: 'demo@studio3.se', ADMIN_PASSWORD: 'demo-losenord-123', YOUTUBE_SYNC: '0', PORT: String(PORT), HOST: '127.0.0.1', SITE_URL: BASE, RESEND_API_KEY: '' };
const NOTICE = 'Förhandsvisning – formulären sparas inte här. Kör servern (npm start) för riktiga ansökningar och admin.';

const seeded = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'tools/seed-demo.js'], { cwd: ROOT, env, encoding: 'utf8' });
if (seeded.status !== 0) throw new Error(seeded.stderr);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: ROOT, env, stdio: 'ignore' });
const stop = () => {
  server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
};

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch { /* startar */ }
    if (i > 60) throw new Error('Servern startade inte');
    await new Promise((r) => setTimeout(r, 100));
  }
  const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  // Några riktiga flöden så att utkorgen får exempelmejl
  await post('/api/public/applications', {
    debate: 'studio-soffan-mobilforbud', name: 'Mika Exempelsson', email: 'mika@exempel.se', phone: '0701112233', birth_year: 1990, municipality: 'Örebro', county: 'Örebro',
    party: 'C', econ: 2, social: -4, stance: 2, need_label: 'För förbud', motivation: 'Jag är lärare och ser hur mobilerna stjäl fokus varje lektion – jag vill debattera det.',
    answers: { roll: 'Lärare/skolpersonal' }, availability: 'ja', consent_age: true, consent_political: true, consent_media: true, t: 90000,
  });
  await post('/api/public/subscribe', { email: 'nyfiken@exempel.se', prefs: ['debatter', 'videor'] });
  await post('/api/public/leads', { type: 'livedebatt', organisation: 'Exempelfestivalen', name: 'Sam Exempel', email: 'sam@exempel.se', message: 'Vi vill ha en livedebatt på festivalens stora scen i juli.' });

  const login = await post('/api/admin/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { Cookie: cookie } })).json();

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

  // /avsnitt/abc → avsnitt-abc.html, /om-oss → om-oss.html
  const mapPath = (p) => {
    const [, pathname = '/', rest = ''] = p.match(/^([^?#]*)(.*)$/);
    if (pathname.startsWith('/assets/js/')) return `js/${pathname.slice(11)}${rest}`;
    if (/\.[a-z0-9]+$/i.test(pathname)) return `../public${pathname}${rest}`;
    const clean = pathname.replace(/^\/+|\/+$/g, '');
    return `${clean ? clean.replace(/\//g, '-') : 'index'}.html${rest}`;
  };
  const transformHtml = (html, file) => {
    html = html
      .replace(/<link rel="canonical"[^>]*>/, '')
      .replace(/<meta property="og:(url|image)"[^>]*>/g, '')
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
      .replace('<head>', '<head>\n  <script src="js/static-shim.js"></script>')
      .replace(/(href|src)="(\/(?!\/)[^"]*)"/g, (_, attr, p) => `${attr}="${mapPath(p)}"`)
      .replace(/"\/assets\//g, '"../public/assets/');
    // Startdata: demonotis överst och relativa sökvägar
    html = html.replace(/(<script type="application\/json" id="bootstrap">)([\s\S]*?)(<\/script>)/, (_, a, json, c) => {
      const data = JSON.parse(json);
      if (file === 'index.html') data.site.announcement = NOTICE;
      return a + JSON.stringify(data).replace(/</g, '\\u003c') + c;
    });
    return html;
  };

  const boot = await get('/api/public/bootstrap');
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const routes = [...sitemap.matchAll(/<loc>[^<]*?127\.0\.0\.1:\d+([^<]*)<\/loc>/g)].map((m) => decodeURIComponent(m[1]));
  const pages = [...new Set([...routes, '/stilpaket', '/admin'])].map((r) => [r, mapPath(r).replace(/\?.*$/, '')]);
  for (const [url, file] of pages) {
    const html = await (await fetch(BASE + url)).text();
    fs.writeFileSync(path.join(OUT, file), transformHtml(html, file));
  }

  // JavaScript: samma filer som sajten, med sökvägar till bilder i public/
  for (const f of fs.readdirSync(path.join(ROOT, 'public/assets/js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'public/assets/js', f), 'utf8');
    fs.writeFileSync(path.join(OUT, 'js', f), src.replace(/(['"`])\/assets\/(?!js\/)/g, '$1../public/assets/'));
  }
  fs.copyFileSync(path.join(ROOT, 'tools/static/shim.js'), path.join(OUT, 'js/static-shim.js'));

  // Ögonblicksbild av admin-API:t
  const debates = await get('/api/admin/debates');
  const list = await get('/api/admin/applications?limit=500');
  const outbox = await get('/api/admin/outbox');
  const snapshot = {
    me: await get('/api/admin/me'),
    dashboard: await get('/api/admin/dashboard'),
    debates,
    debateDetails: await Promise.all(debates.map((d) => get(`/api/admin/debates/${d.id}`))),
    applications: await Promise.all(list.items.map((a) => get(`/api/admin/applications/${a.id}`))),
    subscribers: await get('/api/admin/subscribers'),
    campaigns: await get('/api/admin/campaigns'),
    draftVideos: await get('/api/admin/campaigns/draft-videos'),
    videos: await get('/api/admin/videos'),
    leads: await get('/api/admin/leads'),
    outbox,
    outboxById: Object.fromEntries(await Promise.all(outbox.items.map(async (m) => [m.id, await get(`/api/admin/outbox/${m.id}`)]))),
    settings: await get('/api/admin/settings'),
  };
  snapshot.formats = snapshot.me.meta.formats;
  snapshot.me.user.email = 'demo@studio3.se';
  snapshot.settings.users = [{ id: 1, email: 'demo@studio3.se', name: 'Demo', role: 'admin', created_at: '', last_login: null }];
  fs.writeFileSync(path.join(OUT, 'data/admin-demo.json'), JSON.stringify(snapshot));

  fs.writeFileSync(path.join(OUT, 'README.md'), `# Statisk demo

Genererad med \`npm run build:demo\`. Öppna \`index.html\` via en statisk värd, t.ex.
raw.githack.com. Formulären sparas inte och adminpanelen visar **fiktiv** demodata –
kör den riktiga servern (\`npm start\`) för allt på riktigt.

${pages.length} sidor, t.ex. index.html, debatter.html, format.html, avsnitt.html, profiler.html, om-oss.html, samarbeten.html, press.html, sok.html, stilpaket.html och admin.html.
`);
  console.log(`Klart: ${pages.length} sidor, ${snapshot.applications.length} demoansökningar → demo/`);
} finally {
  stop();
}
