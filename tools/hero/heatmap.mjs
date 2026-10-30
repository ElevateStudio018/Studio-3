#!/usr/bin/env node
/**
 * Hittar de hetaste ögonblicken i kanalens största avsnitt med YouTubes egen
 * "Mest uppspelade"-data (heatmap) och skriver hero-klipplistan.
 *
 *   npm run hero:heatmap                 # topp 12 avsnitt efter visningar
 *   npm run hero:heatmap -- --top 20     # fler avsnitt
 *
 * Skriver:
 *   content/hero-clips.json              – klippen som heron spelar (YouTube-inbäddning)
 *   tools/hero/cutlist.heatmap.json      – samma tider för `npm run hero:footage`
 *                                          om ni vill bränna en MP4 av originalfilerna
 *                                          (döp filerna till <video-id>.mp4)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const TOP = Number(arg('top', 12));
const CLIP_LEN = Number(arg('len', 2.6));
const channel = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/channel.json'), 'utf8'));
const videos = channel.videos.filter((v) => !v.live && v.duration > 600).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, TOP);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(id) {
  const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=sv&gl=SE`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'sv-SE,sv;q=0.9',
      Cookie: 'SOCS=CAI', // samtyckescookie så att sidan visas direkt
    },
  });
  return r.text();
}

async function embeddable(id) {
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  return r.ok;
}

function analyse(html, duration) {
  const deco = html.match(/"decorationTimeMillis":(\d+)/);
  const markers = [...html.matchAll(/"startMillis":"(\d+)","durationMillis":"(\d+)","intensityScoreNormalized":([\d.e-]+)/g)]
    .map((m) => ({ start: Number(m[1]) / 1000, dur: Number(m[2]) / 1000, heat: Number(m[3]) }));
  const peaks = [];
  if (deco) peaks.push({ at: Number(deco[1]) / 1000, heat: 1, source: 'mest-uppspelade' });
  for (const m of [...markers].sort((a, b) => b.heat - a.heat)) {
    const at = m.start + m.dur * 0.5;
    if (at < 90 || at > duration - 60 || m.heat < 0.35) continue; // hoppa över intro och eftertexter
    if (peaks.every((p) => Math.abs(p.at - at) > 60)) peaks.push({ at, heat: Number(m.heat.toFixed(3)), source: 'heatmap' });
    if (peaks.length >= 3) break;
  }
  return { peaks, markers: markers.length };
}

const perVideo = [];
for (const v of videos) {
  try {
    const [html, ok] = await Promise.all([page(v.id), embeddable(v.id)]);
    const { peaks, markers } = analyse(html, v.duration);
    perVideo.push({ id: v.id, title: v.display, format: v.format, views: v.views, embeddable: ok, markers, peaks });
    console.log(`${ok ? '✓' : '✗'} ${v.display.padEnd(48).slice(0, 48)} ${peaks.map((p) => `${Math.round(p.at)}s${p.source === 'mest-uppspelade' ? '★' : ''}`).join(' ') || 'ingen heatmap'}`);
  } catch (err) {
    console.warn(`  ${v.id}: ${err.message}`);
  }
  await sleep(600);
}

// Montage: varje avsnitts "Mest uppspelade"-ögonblick först, sedan nästa topp – varvat mellan avsnitten
const usable = perVideo.filter((v) => v.embeddable && v.peaks.length);
const clips = [];
for (let round = 0; round < 3 && clips.length < 12; round++) {
  for (const v of usable) {
    const p = v.peaks[round];
    if (p && clips.length < 12) clips.push({ id: v.id, title: v.title, format: v.format, start: Math.max(0, Math.round((p.at - 0.8) * 10) / 10), len: CLIP_LEN, source: p.source });
  }
}

fs.writeFileSync(path.join(ROOT, 'content/hero-clips.json'), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), clipLength: CLIP_LEN, clips, videos: perVideo }, null, 1)}\n`);
fs.writeFileSync(path.join(ROOT, 'tools/hero/cutlist.heatmap.json'), `${JSON.stringify(clips.map((c) => ({ file: `${c.id}.mp4`, start: c.start, len: 1.4 })), null, 1)}\n`);
console.log(`\n${clips.length} klipp från ${usable.length} avsnitt → content/hero-clips.json`);
