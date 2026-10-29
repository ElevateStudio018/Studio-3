#!/usr/bin/env node
/**
 * Klipper ihop hero-videon av riktiga inspelningar (era egna originalfiler).
 *
 * Automatiskt läge: analyserar ljudnivån (EBU R128) i varje fil och väljer de
 * mest högljudda – oftast hetaste – ögonblicken, sprider dem över filerna och
 * klipper ihop dem med vita blixtar. Resultatet följer samma tidslinje som
 * sajten förväntar sig: mörkt intro (slogan) → montage → mörkt slut (slutkort).
 *
 *   npm run hero:footage -- --in ./footage
 *   npm run hero:footage -- --in ./footage --cutlist tools/hero/cutlist.example.json
 *
 * Flaggor:
 *   --in <mapp>        mapp med .mp4/.mov/.mkv (krävs)
 *   --out <fil>        standard public/assets/video/hero.mp4
 *   --cutlist <fil>    JSON med egna klipp: [{ "file": "x.mp4", "start": 812.4, "len": 1.4 }]
 *   --clips <n>        antal klipp i montaget (standard 12)
 *   --dry              visa vilka klipp som väljs utan att rendera
 *
 * Krav: ffmpeg och ffprobe i PATH.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), [])
);
if (!args.in) {
  console.error('Ange mappen med inspelningar: --in ./footage');
  process.exit(1);
}

// Samma tidslinje som public/assets/js/home.js (heroIntroEnd / heroEndAt)
const W = 1280, H = 720, FPS = 30;
const INTRO = 2.25, END_AT = 18.9, TOTAL = 22.5;
const CLIPS = Number(args.clips || 12);
const FLASH = 2 / FPS;
const OUT = path.resolve(args.out || path.join(ROOT, 'public/assets/video/hero.mp4'));
const WORK = path.join(ROOT, 'tools/hero/.work');
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const ff = (a) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg misslyckades: ${a.join(' ')}`);
};
const duration = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

/** Ljudnivå (momentary loudness, LUFS) var 100:e ms. */
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=none', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = [];
  for (const m of r.stderr.matchAll(/t:\s*([\d.]+)\s+TARGET:[^M]*M:\s*(-?[\d.]+|-inf)/g)) out.push({ t: Number(m[1]), m: m[2] === '-inf' ? -120 : Number(m[2]) });
  return out;
}

/** Hitta de högljuddaste fönstren (medelvärde över klipplängden), minst 25 s mellan träffarna. */
function peaks(series, len, count, dur) {
  const win = Math.max(1, Math.round(len / 0.1));
  const scored = [];
  for (let i = 0; i + win < series.length; i += 2) {
    const slice = series.slice(i, i + win);
    const avg = slice.reduce((s, x) => s + x.m, 0) / slice.length;
    const t = series[i].t;
    if (t > 20 && t < dur - 20) scored.push({ t, score: avg }); // hoppa över intro/outro i avsnittet
  }
  scored.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const s of scored) {
    if (picked.every((p) => Math.abs(p.t - s.t) > 25)) picked.push(s);
    if (picked.length >= count) break;
  }
  return picked;
}

const files = fs.readdirSync(args.in).filter((f) => /\.(mp4|mov|mkv|m4v|webm)$/i.test(f)).map((f) => path.join(args.in, f));
if (!files.length) throw new Error(`Inga videofiler i ${args.in}`);

const montageLen = END_AT - INTRO;
const clipLen = Math.max(0.6, (montageLen - (CLIPS - 1) * FLASH) / CLIPS);
let cuts;
if (args.cutlist) {
  cuts = JSON.parse(fs.readFileSync(args.cutlist, 'utf8')).map((c) => ({ file: path.resolve(args.in, c.file), start: Number(c.start), len: Number(c.len || clipLen) }));
} else {
  console.log(`Analyserar ljudet i ${files.length} fil(er)…`);
  const perFile = files.map((file) => {
    const dur = duration(file);
    const p = peaks(loudness(file), clipLen, Math.ceil(CLIPS / files.length) + 2, dur);
    console.log(`  ${path.basename(file)}: ${p.map((x) => `${x.t.toFixed(1)}s (${x.score.toFixed(1)} LUFS)`).join(', ')}`);
    return p.map((x) => ({ file, start: Math.max(0, x.t - 0.2), len: clipLen, score: x.score }));
  });
  // Varva filerna så att montaget hoppar mellan avsnitt, starkaste först
  cuts = [];
  for (let i = 0; cuts.length < CLIPS && perFile.some((l) => l[i]); i++) for (const l of perFile) if (l[i] && cuts.length < CLIPS) cuts.push(l[i]);
}
if (!cuts.length) throw new Error('Hittade inga klipp.');
// Anpassa klipplängden så att slutkortet alltid hamnar på END_AT, även med färre klipp
const flashes = Math.ceil((cuts.length - 1) / 2);
const fitted = (montageLen - flashes * FLASH) / cuts.length;
if (!args.cutlist) cuts.forEach((c) => (c.len = fitted));
console.log(`\n${cuts.length} klipp à ${(args.cutlist ? clipLen : fitted).toFixed(2)} s:`);
cuts.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${path.basename(c.file)} @ ${c.start.toFixed(1)} s`));
if (args.dry) process.exit(0);

const grade = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,eq=contrast=1.12:saturation=0.9`;
const enc = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'];
const parts = [];
// Intro: mörk, suddig bild bakom sloganen
ff(['-ss', String(cuts[0].start), '-t', String(INTRO), '-i', cuts[0].file, '-vf', `${grade},boxblur=12:2,eq=brightness=-0.32`, ...enc, path.join(WORK, 'intro.mp4')]);
parts.push('intro.mp4');
ff(['-f', 'lavfi', '-i', `color=c=white:s=${W}x${H}:r=${FPS}:d=${FLASH}`, ...enc, path.join(WORK, 'flash.mp4')]);
cuts.forEach((c, i) => {
  // Lätt inzoomning per klipp ger energi även i statiska studiobilder
  const zoom = `scale=${Math.round(W * 1.12)}:-2,crop=${W}:${H}:(iw-${W})/2+${i % 2 ? 20 : -20}:(ih-${H})/2-30`;
  ff(['-ss', String(c.start), '-t', String(c.len), '-i', c.file, '-vf', `${grade},${zoom}`, ...enc, path.join(WORK, `clip${i}.mp4`)]);
  parts.push(`clip${i}.mp4`);
  if (i < cuts.length - 1 && i % 2 === 0) parts.push('flash.mp4');
});
// Slut: lugn, mörk bild där slutkortet visas
const last = cuts[cuts.length - 1];
ff(['-ss', String(last.start), '-t', String(TOTAL - END_AT), '-i', last.file, '-vf', `${grade},boxblur=3:1,eq=brightness=-0.3:saturation=0.75`, ...enc, path.join(WORK, 'end.mp4')]);
parts.push('end.mp4');

fs.writeFileSync(path.join(WORK, 'list.txt'), parts.map((p) => `file '${p}'`).join('\n'));
const joined = path.join(WORK, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'list.txt'), '-c', 'copy', joined]);
ff(['-i', joined, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT]);
ff(['-i', OUT, '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT.replace(/\.mp4$/, '-mobile.mp4')]);
ff(['-sseof', '-0.5', '-i', OUT, '-frames:v', '1', '-q:v', '3', OUT.replace(/\.mp4$/, '-poster.jpg')]);
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`\nKlart: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB, ${duration(OUT).toFixed(1)} s)`);
