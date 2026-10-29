import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { get, run, getSetting, setSetting } from './db.js';
import { hashPassword, randomToken } from './security.js';
import { defaultSite } from './content.js';
import { seedVideos } from './youtube.js';

const inDays = (d, h = 18) => {
  const t = new Date(Date.now() + d * 864e5);
  t.setHours(h, 0, 0, 0);
  return t.toISOString().slice(0, 16);
};

/** Exempeldebatter så att sajten och admin inte är tomma vid första start. Redigera eller radera i admin. */
export const SAMPLE_DEBATES = () => [
  {
    slug: 'partiledare-vs-20-valjare', title: 'Partiledare vs 20 väljare', format: 'partiledare',
    statement: 'Regeringen har gjort Sverige till ett bättre land de senaste fyra åren.',
    summary: 'Vi söker 20 väljare från hela det politiska spektrumet som vill ställa en partiledare mot väggen.',
    description: 'En partiledare sätter sig i mitten. Runt hen sitter tjugo väljare – och ni bestämmer frågorna. Vi vill ha en blandning av åldrar, bakgrunder och partisympatier. Du behöver inte vara expert, bara ha en åsikt och våga säga den.',
    event_at: inDays(24), location: 'Studio 3, Stockholm', deadline: inDays(12, 23), spots: 20, status: 'open', featured: 1,
    needs: [{ label: 'Rödgröna väljare (S, V, MP, C)', count: 10, parties: ['S', 'V', 'MP', 'C'] }, { label: 'Tidöväljare (M, SD, KD, L)', count: 10, parties: ['M', 'SD', 'KD', 'L'] }],
    questions: [{ id: 'fraga', label: 'Vilken fråga skulle du ställa till partiledaren?', type: 'textarea', required: true }],
  },
  {
    slug: 'studio-soffan-mobilforbud', title: 'Studio Soffan: Mobilförbud i skolan', format: 'soffan',
    statement: 'Mobiltelefoner ska förbjudas helt under hela skoldagen.',
    summary: 'Sex personer, en soffa och frågan alla föräldrar, lärare och elever har en åsikt om.',
    description: 'Är du lärare, förälder, elev eller bara har en stark åsikt om mobiler i skolan? Vi söker sex personer som tycker olika – på riktigt.',
    event_at: inDays(17), location: 'Studio 3, Stockholm', deadline: inDays(9, 23), spots: 6, status: 'open', featured: 0,
    needs: [{ label: 'För förbud', count: 3, stance: 'for' }, { label: 'Emot förbud', count: 3, stance: 'emot' }],
    questions: [
      { id: 'roll', label: 'Vilken är din koppling till skolan?', type: 'select', options: ['Elev', 'Förälder', 'Lärare/skolpersonal', 'Ingen särskild'], required: true },
    ],
  },
  {
    slug: '1-mot-20-karnkraft', title: '1 mot 20: Kärnkraft', format: '1vs20',
    statement: 'Sverige ska bygga ut kärnkraften kraftigt.',
    summary: 'Tjugo personer som är emot ny kärnkraft möter en av landets mest kända kärnkraftsförespråkare.',
    description: 'Är du kritisk till ny kärnkraft – av miljöskäl, ekonomiska skäl eller något helt annat? Då vill vi ha dig bland de tjugo.',
    event_at: inDays(31), location: 'Studio 3, Stockholm', deadline: inDays(18, 23), spots: 20, status: 'open', featured: 0,
    needs: [{ label: 'Emot ny kärnkraft', count: 20, stance: 'emot' }],
    questions: [],
  },
];

export function seed() {
  // Grundinställningar (fyller på nya nycklar utan att skriva över ändringar)
  const defaults = defaultSite();
  const current = getSetting('site', null);
  setSetting('site', current ? { ...defaults, ...current } : defaults);

  seedVideos();

  if (!get('SELECT id FROM users LIMIT 1')) {
    const password = config.adminPassword || randomToken(9);
    run('INSERT INTO users (email, name, pass_hash, role) VALUES (?, ?, ?, ?)', config.adminEmail, 'Admin', hashPassword(password), 'admin');
    if (!config.adminPassword) {
      const file = path.join(config.dataDir, 'FORSTA-INLOGGNING.txt');
      fs.writeFileSync(file, `Admin: ${config.adminEmail}\nLösenord: ${password}\n\nByt lösenord i admin under Inställningar och radera sedan den här filen.\n`, { mode: 0o600 });
      console.log(`\n  Admin skapad: ${config.adminEmail} / ${password}\n  (sparat i ${file})\n`);
    }
  }

  if (process.env.SEED_SAMPLE_DEBATES !== '0' && !get('SELECT id FROM debates LIMIT 1')) {
    for (const d of SAMPLE_DEBATES()) {
      run(
        `INSERT INTO debates (slug, title, format, statement, summary, description, event_at, location, deadline, spots, status, featured, needs, questions, opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        d.slug, d.title, d.format, d.statement, d.summary, d.description, d.event_at, d.location, d.deadline, d.spots, d.status, d.featured,
        JSON.stringify(d.needs), JSON.stringify(d.questions)
      );
    }
  }
}
