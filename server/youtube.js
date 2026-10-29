import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { all, get, run, tx, getSetting, setSetting } from './db.js';

export function loadChannel() {
  return JSON.parse(fs.readFileSync(path.join(config.contentDir, 'channel.json'), 'utf8'));
}

export function detectFormat(title) {
  const t = title.toUpperCase();
  if (t.includes('STUDIO SOFFAN')) return 'soffan';
  if (t.includes('DUELLEN')) return 'duellen';
  if (t.includes('PANELEN')) return 'panelen';
  if (t.includes('VALVAKA')) return 'valvakan';
  if (/PARTILEDARE/.test(t)) return 'partiledare';
  if (/\bVS 20\b|\b20 VS\b/.test(t)) return '1vs20';
  if (t.includes('KOMMENTARER')) return 'kommentarer';
  return 'ovrigt';
}

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
export function peopleFromTitle(title) {
  const m = title.split('|')[0].trim().match(/^(.+?)\s+VS\s+(.+)$/i);
  if (!m) return [];
  return [m[1], m[2]]
    .map((s) => s.replace(/\s*\(\w+\)/g, '').trim())
    .filter((s) => !/^(1|20)\b/.test(s) && !/(PARTIET|DEMOKRATERNA|MODERATERNA)$/i.test(s))
    .map((s) => s.split(/\s+/).map((w) => w.split('-').map(cap).join('-')).join(' '));
}

export function displayTitle(title) {
  const quote = title.match(/^\s*["”“](.+?)["”“]\s*\|/);
  if (quote) return { display: quote[1].trim(), quote: quote[1].trim() };
  const head = title.split('|')[0].trim();
  const pretty = head
    .split(/\s+/)
    .map((w) => (/^\(\w+\)$/.test(w) || /^(SD|MP|KD)$/.test(w) ? w : w === 'VS' ? 'vs' : cap(w)))
    .join(' ');
  return { display: pretty, quote: null };
}

/** Första start: lägg in den skrapade kanaldatan i databasen. */
export function seedVideos() {
  if (get('SELECT COUNT(*) AS n FROM videos').n > 0) return;
  const ch = loadChannel();
  tx(() => {
    for (const v of ch.videos) {
      run(
        `INSERT INTO videos (id, title, display, quote, topic, format, views, duration, published_at, position, live, people)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v.id, v.title, v.display, v.quote, v.topic, v.format, v.views, v.duration, v.published, v.position, v.live ? 1 : 0, JSON.stringify(v.people || [])
      );
    }
  });
  setSetting('channelStats', { ...ch.channel, updatedAt: ch.scrapedAt, source: 'skrapad' });
}

function parseFeed(xml) {
  const entries = [];
  for (const block of xml.split('<entry>').slice(1)) {
    const pick = (re) => (block.match(re) || [])[1];
    const decode = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    entries.push({
      id: pick(/<yt:videoId>([^<]+)</),
      title: decode(pick(/<title>([^<]*)</)),
      published: pick(/<published>([^<]+)</),
      views: Number(pick(/<media:statistics views="(\d+)"/) || 0) || null,
    });
  }
  return entries.filter((e) => e.id && e.title);
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Studio3Site/1.0', 'Accept-Language': 'sv-SE' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} för ${url}`);
  return r.text();
}

/**
 * Hämtar senaste långa videorna via YouTubes öppna RSS-flöde (UULF = utan Shorts).
 * Med YOUTUBE_API_KEY hämtas även prenumeranter och totala visningar via Data API v3.
 * Returnerar listan med nya video-id:n.
 */
export async function syncYoutube() {
  const id = config.youtube.channelId;
  const feed = parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${id.slice(2)}`));
  const fresh = [];
  tx(() => {
    for (const e of feed) {
      const existing = get('SELECT id FROM videos WHERE id = ?', e.id);
      if (existing) {
        run("UPDATE videos SET views = COALESCE(?, views), published_at = COALESCE(published_at, ?), updated_at = datetime('now') WHERE id = ?", e.views, e.published, e.id);
      } else {
        const { display, quote } = displayTitle(e.title);
        const minPos = get('SELECT MIN(position) AS p FROM videos').p ?? 0;
        run(
          'INSERT INTO videos (id, title, display, quote, format, views, published_at, position, people) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          e.id, e.title, display, quote, detectFormat(e.title), e.views, e.published, minPos - 1, JSON.stringify(peopleFromTitle(e.title))
        );
        fresh.push(e.id);
      }
    }
  });
  if (config.youtube.apiKey) {
    const data = JSON.parse(await fetchText(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${id}&key=${config.youtube.apiKey}`));
    const s = data.items?.[0]?.statistics;
    if (s) {
      const prev = getSetting('channelStats', {});
      setSetting('channelStats', { ...prev, subscribers: Number(s.subscriberCount), views: Number(s.viewCount), videos: Number(s.videoCount), updatedAt: new Date().toISOString(), source: 'youtube-api' });
    }
  }
  setSetting('youtubeSync', { at: new Date().toISOString(), ok: true, found: feed.length, fresh: fresh.length });
  return fresh;
}

export function videoRows({ includeHidden = false } = {}) {
  return all(`SELECT * FROM videos ${includeHidden ? '' : 'WHERE hidden = 0'} ORDER BY pinned DESC, position ASC`).map((v) => ({
    ...v,
    people: JSON.parse(v.people || '[]'),
    live: !!v.live,
    hidden: !!v.hidden,
    pinned: !!v.pinned,
  }));
}
