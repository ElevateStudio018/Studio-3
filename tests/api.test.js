// Integrationstester: startar servern mot en tom, tillfällig databas.
// Kör: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 's3-test-'));
let proc;
let cookie = '';

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, ADMIN_EMAIL: 'test@studio3.se', ADMIN_PASSWORD: 'testlosenord123', YOUTUBE_SYNC: '0', SITE_URL: BASE },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* startar fortfarande */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Servern startade inte');
});
after(() => {
  proc?.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const admin = (p, opts = {}) => fetch(BASE + p, { ...opts, headers: { Cookie: cookie, 'X-Requested-With': 'studio3', 'Content-Type': 'application/json', ...(opts.headers || {}) } });

const validApplication = (extra = {}) => ({
  debate: 'partiledare-vs-20-valjare', kind: 'deltagare', name: 'Test Testsson', email: 'test.testsson@exempel.se', phone: '0701234567', birth_year: 1995,
  municipality: 'Örebro', county: 'Örebro', party: 'S', econ: -4, social: -2, stance: -2, need_label: 'Rödgröna väljare (S, V, MP, C)',
  motivation: 'Jag vill ställa partiledaren mot väggen om välfärden och vården i min kommun.', availability: 'ja',
  answers: { fraga: 'Varför ska min mamma vänta ett år på en operation?' }, consent_age: true, consent_political: true, consent_media: true, t: 60000,
  ...extra,
});

test('startsidan renderas med stilpaket, logga och startdata', async () => {
  const html = await (await fetch(BASE)).text();
  assert.match(html, /data-theme="studio"/);
  assert.match(html, /<symbol id="s3logo"/);
  assert.match(html, /id="bootstrap"/);
  assert.match(html, /application\/ld\+json/);
  const preview = await (await fetch(`${BASE}/?stil=riksdag`)).text();
  assert.match(preview, /data-theme="riksdag"/);
});

test('startdata innehåller kanalens videor, profiler och exempeldebatter', async () => {
  const d = await (await fetch(`${BASE}/api/public/bootstrap`)).json();
  assert.ok(d.videos.length >= 70);
  assert.ok(d.people.length > 50);
  assert.equal(d.debates.filter((x) => x.open).length, 3);
  assert.equal(d.stats.subscribers, 103000);
  assert.ok(!('notifyEmail' in d.site), 'interna inställningar får inte läcka');
  assert.ok(d.heroClips.length >= 6, 'heron ska ha klipp ur riktiga avsnitt');
  assert.ok(d.heroClips.every((c) => /^[\w-]{11}$/.test(c.id) && c.start >= 0 && c.len > 0));
  assert.equal(d.site.heroMode, 'youtube');
});

test('ansökningssidor: öppen debatt, talangbank och 404', async () => {
  assert.equal((await fetch(`${BASE}/sok/partiledare-vs-20-valjare`)).status, 200);
  assert.equal((await fetch(`${BASE}/sok`)).status, 200);
  assert.equal((await fetch(`${BASE}/sok/finns-inte`)).status, 404);
});

test('undersidor renderas på servern', async () => {
  const pages = ['/debatter', '/format', '/format/1vs20', '/avsnitt', '/avsnitt/2D3DJt9OJxo', '/profiler', '/profiler/nick-alinia', '/om-oss', '/faq', '/samarbeten', '/press', '/nyhetsbrev', '/kontakt'];
  for (const p of pages) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    assert.match(html, /<main id="innehall">/, p);
    assert.match(html, /aria-label="Huvudmeny"/, p);
  }
  const ep = await (await fetch(`${BASE}/avsnitt/2D3DJt9OJxo`)).text();
  assert.match(ep, /Jan Emanuel vs 20 miljöpartister/);
  assert.match(ep, /"@type":"VideoObject"/);
  assert.match(ep, /data-seek="548"/, 'mest uppspelade-tiden ska visas');
  const person = await (await fetch(`${BASE}/profiler/nick-alinia`)).text();
  assert.match(person, /Har debatterat mot/);
  for (const p of ['/format/finns-inte', '/avsnitt/finnsinte123', '/profiler/ingen-alls']) assert.equal((await fetch(BASE + p)).status, 404, p);
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  assert.ok((sitemap.match(/<loc>/g) || []).length > 150, 'sitemap ska innehålla alla undersidor');
});

test('ansökan valideras fält för fält', async () => {
  const r = await post('/api/public/applications', { debate: 'partiledare-vs-20-valjare', name: 'A', email: 'fel', t: 60000 });
  assert.equal(r.status, 422);
  const { fields } = await r.json();
  for (const k of ['name', 'email', 'phone', 'birth_year', 'party', 'motivation', 'consent_political', 'consent_media', 'consent_age', 'q_fraga']) assert.ok(fields[k], `saknar fel för ${k}`);
});

test('ansökan under 18 år nekas', async () => {
  const r = await post('/api/public/applications', validApplication({ birth_year: new Date().getFullYear() - 16 }));
  assert.equal(r.status, 422);
  assert.ok((await r.json()).fields.birth_year);
});

test('botar som skickar för snabbt stoppas', async () => {
  const r = await post('/api/public/applications', validApplication({ t: 900 }));
  assert.equal(r.status, 400);
});

test('giltig ansökan sparas och ger referensnummer', async () => {
  const r = await post('/api/public/applications', validApplication());
  assert.equal(r.status, 201);
  const { ref } = await r.json();
  assert.match(ref, /^S3-\d{6}$/);
});

test('admin kräver inloggning och rätt lösenord', async () => {
  assert.equal((await fetch(`${BASE}/api/admin/dashboard`)).status, 401);
  assert.equal((await post('/api/admin/login', { email: 'test@studio3.se', password: 'fel' })).status, 401);
  const r = await post('/api/admin/login', { email: 'test@studio3.se', password: 'testlosenord123' });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
});

test('admin-ändringar utan CSRF-header nekas', async () => {
  const r = await fetch(`${BASE}/api/admin/debates`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"title":"x"}' });
  assert.equal(r.status, 403);
});

test('admin ser ansökan, sätter status och exporterar CSV', async () => {
  const list = await (await admin('/api/admin/applications')).json();
  assert.equal(list.total, 1);
  const app = list.items[0];
  assert.equal(app.party, 'S');
  assert.ok(app.score > 50, 'matchningspoäng ska räknas ut');
  const patched = await (await admin(`/api/admin/applications/${app.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'shortlist', rating: 4, tags: ['stark röst'] }) })).json();
  assert.equal(patched.status, 'shortlist');
  assert.equal(patched.rating, 4);
  assert.deepEqual(patched.tags, ['stark röst']);
  assert.ok(patched.events.some((e) => e.message === 'ny → shortlist'));
  const csvRes = await admin('/api/admin/export/applications.csv');
  const buf = Buffer.from(await csvRes.arrayBuffer());
  const csv = buf.toString('utf8');
  assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM så att Excel läser åäö rätt');
  assert.ok(csv.includes('Ref;Debatt'));
  assert.match(csv, /Test Testsson/);
});

test('kvitto till sökande hamnar i utkorgen', async () => {
  const out = await (await admin('/api/admin/outbox')).json();
  assert.ok(out.items.some((m) => m.to_email === 'test.testsson@exempel.se' && m.kind === 'kvitto'));
});

test('admin skapar debatt; stängd debatt tar inte emot ansökningar', async () => {
  const r = await admin('/api/admin/debates', { method: 'POST', body: JSON.stringify({ title: 'Duellen: Testfrågan', format: 'duellen', status: 'closed', needs: [{ label: 'För', count: 1, stance: 'for' }] }) });
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.slug, 'duellen-testfragan');
  const apply = await post('/api/public/applications', validApplication({ debate: d.slug }));
  assert.equal(apply.status, 409);
});

test('nyhetsbrev: dubbel opt-in och avregistrering', async () => {
  const r = await post('/api/public/subscribe', { email: 'nyfiken@exempel.se', prefs: ['debatter'] });
  assert.equal((await r.json()).status, 'pending');
  const out = await (await admin('/api/admin/outbox')).json();
  const mail = await (await admin(`/api/admin/outbox/${out.items.find((m) => m.to_email === 'nyfiken@exempel.se').id}`)).json();
  const token = mail.html.match(/token=([\w-]+)/)[1];
  const confirm = await fetch(`${BASE}/nyhetsbrev/bekrafta?token=${token}`, { redirect: 'manual' });
  assert.equal(confirm.status, 302);
  const subs = await (await admin('/api/admin/subscribers?status=confirmed')).json();
  assert.ok(subs.items.some((s) => s.email === 'nyfiken@exempel.se'));
  await fetch(`${BASE}/nyhetsbrev/avsluta?token=${token}`, { redirect: 'manual' });
  const after = await (await admin('/api/admin/subscribers?status=unsubscribed')).json();
  assert.ok(after.items.some((s) => s.email === 'nyfiken@exempel.se'));
});

test('partnerförfrågan sparas', async () => {
  assert.equal((await post('/api/public/leads', { type: 'livedebatt', name: 'Kim', email: 'kim@exempel.se', message: 'Livedebatt på vår festival i juli.' })).status, 201);
  const leads = await (await admin('/api/admin/leads')).json();
  assert.equal(leads[0].type, 'livedebatt');
});

test('admin kan välja egna hero-klipp och MP4-läge', async () => {
  await admin('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ heroMode: 'mp4', heroClips: [{ id: '2D3DJt9OJxo', start: 100, len: 3 }, { id: 'ogiltigt', start: 1 }] }) });
  const d = await (await fetch(`${BASE}/api/public/bootstrap`)).json();
  assert.equal(d.site.heroMode, 'mp4');
  assert.deepEqual(d.heroClips.map((c) => c.id), ['2D3DJt9OJxo']);
  await admin('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ heroMode: 'youtube', heroClips: [] }) });
  assert.ok((await (await fetch(`${BASE}/api/public/bootstrap`)).json()).heroClips.length >= 6);
});

test('stilpaket kan bytas från admin', async () => {
  await admin('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ theme: 'valvaka' }) });
  assert.match(await (await fetch(BASE)).text(), /data-theme="valvaka"/);
  await admin('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ theme: 'finns-inte' }) });
  assert.match(await (await fetch(BASE)).text(), /data-theme="studio"/);
});

test('hero-videon strömmas med Range-stöd', async () => {
  const r = await fetch(`${BASE}/assets/video/hero.mp4`, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(r.status, 206);
  assert.equal((await r.arrayBuffer()).byteLength, 1024);
});

test('katalogvandring och .html-filer stoppas', async () => {
  const status = (p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => (res.resume(), resolve(res.statusCode))));
  assert.equal(await status('/../server.js'), 404);
  assert.equal(await status('/assets/../../server/db.js'), 404);
  assert.equal(await status('/admin/index.html'), 404);
});

test('trasiga adresser kraschar inte servern', async () => {
  const status = (p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => (res.resume(), resolve(res.statusCode))));
  assert.equal(await status('/%E0%A4%A'), 400);
  assert.equal(await status('/sok/100%25'), 404);
  assert.equal(await status('/api/admin/applications/%E0'), 400);
  assert.equal((await fetch(`${BASE}/health`)).status, 200);
});

test('säkerhetshuvuden sätts', async () => {
  const r = await fetch(BASE);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self' https:\/\/www\.youtube\.com/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
