#!/usr/bin/env node
/**
 * Laddar ner exakt de klipp som heron använder (content/hero-clips.json) och
 * bränner en MP4 av dem. Kör på er egen dator – kräver yt-dlp och ffmpeg.
 *
 *   npm run hero:download
 *
 * Steg: 1) yt-dlp hämtar bara de sekunder som behövs ur varje avsnitt
 *       2) hero_from_footage.mjs klipper ihop dem till public/assets/video/hero.mp4
 * Välj sedan "MP4-filen" som hero-video i admin (Innehåll & stil) om ni vill
 * använda filen i stället för YouTube-spelaren.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'footage/hero-clips');
const { clips } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/hero-clips.json'), 'utf8'));
const LEN = 1.35; // sekunder per klipp i den färdiga MP4:an (12 klipp ≈ samma tidslinje som sajten)

if (spawnSync('yt-dlp', ['--version']).status !== 0) {
  console.error('Installera yt-dlp först: https://github.com/yt-dlp/yt-dlp#installation');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const cutlist = [];
clips.forEach((c, i) => {
  const file = `clip-${String(i + 1).padStart(2, '0')}.mp4`;
  if (!fs.existsSync(path.join(OUT, file))) {
    console.log(`Hämtar ${i + 1}/${clips.length}: ${c.title || c.id} @ ${c.start}s`);
    const r = spawnSync('yt-dlp', [
      '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/b',
      '--download-sections', `*${c.start}-${c.start + Math.max(LEN, c.len) + 0.5}`,
      '--force-keyframes-at-cuts', '--merge-output-format', 'mp4', '--no-playlist',
      '-o', path.join(OUT, file), `https://www.youtube.com/watch?v=${c.id}`,
    ], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.warn(`  hoppar över ${c.id}`);
      return;
    }
  }
  cutlist.push({ file, start: 0.2, len: LEN });
});
fs.writeFileSync(path.join(OUT, 'cutlist.json'), JSON.stringify(cutlist, null, 1));
spawnSync(process.execPath, [path.join(ROOT, 'tools/hero/hero_from_footage.mjs'), '--in', OUT, '--cutlist', path.join(OUT, 'cutlist.json')], { stdio: 'inherit' });
