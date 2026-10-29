// Fyller databasen med FIKTIVA demoansökningar, prenumeranter och förfrågningar
// så att adminpanelen kan visas upp. Allt märks med taggen "demo".
// Kör: npm run seed:demo   (radera sedan med: npm run seed:demo -- --rensa)
import { all, get, run, tx, track } from '../server/db.js';
import { seed } from '../server/seed.js';
import { scoreApplication } from '../server/routes/public.js';

seed();

if (process.argv.includes('--rensa')) {
  const n = all(`SELECT id FROM applications WHERE tags LIKE '%"demo"%'`).length;
  run(`DELETE FROM applications WHERE tags LIKE '%"demo"%'`);
  run(`DELETE FROM subscribers WHERE source = 'demo'`);
  run(`DELETE FROM leads WHERE notes = 'demo'`);
  console.log(`Raderade ${n} demoansökningar samt demo-prenumeranter och demo-förfrågningar.`);
  process.exit(0);
}

let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

const FIRST = ['Alva', 'Elias', 'Maja', 'Noah', 'Ella', 'William', 'Wilma', 'Hugo', 'Saga', 'Liam', 'Alice', 'Oscar', 'Ebba', 'Lucas', 'Selma', 'Adam', 'Astrid', 'Nils', 'Freja', 'Leo', 'Amira', 'Omar', 'Linnea', 'Viktor', 'Tilde', 'Ali', 'Sara', 'Erik', 'Hanna', 'Karl', 'Yasmin', 'Johan', 'Fatima', 'Anton', 'Moa', 'Gustav', 'Nora', 'Malte', 'Emilia', 'Isak'];
const LAST = ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jonsson', 'Lindberg', 'Holm', 'Berg', 'Lund', 'Ahmed', 'Hassan', 'Ali', 'Nyström', 'Lindqvist', 'Sandberg', 'Forsberg', 'Ek', 'Sjöberg', 'Engström'];
const PLACES = [['Stockholm', 'Stockholm'], ['Göteborg', 'Västra Götaland'], ['Malmö', 'Skåne'], ['Uppsala', 'Uppsala'], ['Örebro', 'Örebro'], ['Linköping', 'Östergötland'], ['Umeå', 'Västerbotten'], ['Västerås', 'Västmanland'], ['Norrköping', 'Östergötland'], ['Lund', 'Skåne'], ['Sundsvall', 'Västernorrland'], ['Gävle', 'Gävleborg'], ['Jönköping', 'Jönköping'], ['Karlstad', 'Värmland'], ['Luleå', 'Norrbotten']];
const JOBS = ['Student', 'Undersköterska', 'Elektriker', 'Lärare', 'Säljare', 'Sjuksköterska', 'Egenföretagare', 'Ekonom', 'Snickare', 'Pensionär', 'Programmerare', 'Butiksbiträde', 'Polis', 'Arbetssökande', 'Läkare', 'Lastbilschaufför'];
const PARTY_W = [['S', 18], ['M', 15], ['SD', 15], ['V', 9], ['C', 5], ['KD', 5], ['L', 4], ['MP', 6], ['OSAKER', 9], ['EJ', 4], ['ANNAT', 2]];
const CENTER = { S: [-4, -2], V: [-8, -5], MP: [-4, -7], C: [3, -5], L: [4, -3], M: [6, 2], KD: [4, 6], SD: [2, 7], OSAKER: [0, 0], EJ: [0, 0], ANNAT: [0, 3] };
const MOTIV = [
  'Jag har jobbat inom vården i tolv år och är trött på att politiker pratar om oss utan att fråga oss. Jag vill säga hur det faktiskt ser ut på golvet.',
  'Jag är 22 år och har aldrig känt att någon partiledare pratar med min generation. Jag har tydliga åsikter och är inte rädd för att säga emot.',
  'Jag driver ett eget företag på landsbygden och vill visa att verkligheten utanför storstäderna ser helt annorlunda ut än vad man tror i Stockholm.',
  'Jag har ändrat uppfattning i den här frågan två gånger och tror att jag kan bidra med något mer nyanserat än bara för eller emot.',
  'Jag tittar på varje avsnitt och skriker på tv:n. Nu vill jag sitta i stolen själv och se om mina argument håller.',
  'Som lärare ser jag konsekvenserna av politiska beslut varje dag. Jag vill ställa krav och få riktiga svar.',
  'Jag kom till Sverige som tolvåring och har åsikter som inte passar in i något fack. Jag tror att det gör debatten bättre.',
];
const weighted = (list) => {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
};

const debates = all("SELECT * FROM debates WHERE status = 'open'");
const statuses = ['ny', 'ny', 'ny', 'ny', 'granskad', 'granskad', 'shortlist', 'shortlist', 'intervju', 'uttagen', 'bekraftad', 'reserv', 'nej'];
let made = 0;
tx(() => {
  for (let i = 0; i < 140; i++) {
    const debate = i % 9 === 0 ? null : debates[i % debates.length];
    const needs = debate ? JSON.parse(debate.needs) : [];
    const party = weighted(PARTY_W);
    const [ce, cs] = CENTER[party];
    const econ = Math.max(-10, Math.min(10, Math.round(ce + gauss() * 4)));
    const social = Math.max(-10, Math.min(10, Math.round(cs + gauss() * 4)));
    const stance = debate?.statement ? Math.max(-2, Math.min(2, Math.round((party === 'M' || party === 'SD' || party === 'KD' ? 1 : -1) * rnd() * 2.4 + gauss()))) : null;
    const fitting = needs.find((n) => (n.parties && n.parties.includes(party)) || (n.stance === 'for' && stance > 0) || (n.stance === 'emot' && stance < 0)) || needs[Math.floor(rnd() * needs.length)];
    const [municipality, county] = pick(PLACES);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const a = {
      name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}${i}@exempel.se`, phone: `07${Math.floor(rnd() * 1e8).toString().padStart(8, '0')}`,
      birth_year: 1950 + Math.floor(rnd() * 56), party, stance, econ, social, need_label: fitting?.label || '', motivation: pick(MOTIV),
      media_experience: rnd() < 0.2, availability: pick(['ja', 'ja', 'ja', 'kanske', 'nej']), video_link: rnd() < 0.25 ? 'https://www.tiktok.com/@exempel' : '',
      socials: { instagram: rnd() < 0.5 ? `@${name.split(' ')[0].toLowerCase()}${i}` : '' }, photo: null,
    };
    const created = new Date(Date.now() - Math.floor(rnd() * rnd() * 28 * 864e5) - Math.floor(rnd() * 864e5)).toISOString().replace('T', ' ').slice(0, 19);
    const { lastInsertRowid: id } = run(
      `INSERT INTO applications (ref, debate_id, status, rating, score, name, email, phone, birth_year, gender, municipality, county, occupation, party, party_member,
        office, econ, social, stance, need_label, motivation, data, tags, consent_political, consent_media, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'demo', ?, ?)`,
      `TMP-${i}-${Date.now()}`, debate?.id ?? null, pick(statuses), rnd() < 0.4 ? 1 + Math.floor(rnd() * 5) : 0, scoreApplication(a, debate), a.name, a.email, a.phone,
      a.birth_year, pick(['Kvinna', 'Man', 'Kvinna', 'Man', '']), municipality, county, pick(JOBS), party, rnd() < 0.25 ? 1 : 0, rnd() < 0.08 ? 'kommun' : '',
      econ, social, stance, a.need_label, a.motivation,
      JSON.stringify({ availability: a.availability, socials: a.socials, video_link: a.video_link, media_experience: a.media_experience, argument: 'Vi måste våga prata om det här på riktigt.', heard_from: pick(['YouTube', 'TikTok', 'Instagram', 'En vän tipsade']), answers: {} }),
      JSON.stringify(['demo']), created, created
    );
    run('UPDATE applications SET ref = ? WHERE id = ?', `S3-26${String(id).padStart(4, '0')}`, id);
    run('INSERT INTO application_events (application_id, type, message, created_at) VALUES (?, ?, ?, ?)', id, 'skapad', 'Ansökan via webben (demo)', created);
    made++;
  }
  for (let i = 0; i < 60; i++) {
    run('INSERT OR IGNORE INTO subscribers (email, prefs, status, token, source, county, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      `prenumerant${i}@exempel.se`, JSON.stringify(rnd() < 0.7 ? ['debatter', 'videor'] : ['videor']), rnd() < 0.85 ? 'confirmed' : 'pending', `demo-${i}-${Date.now()}`, 'demo', pick(PLACES)[1]);
  }
  const leads = [
    ['sponsring', 'Exempelbolaget AB', 'Kim Exempel', 'Vi vill presentera en säsong av Studio Soffan inför 2027.', '75 000–200 000 kr', 'offert', 120000],
    ['livedebatt', 'Exempelkommunens ungdomsråd', 'Robin Test', 'Livedebatt med förstagångsväljare på stadsfestivalen i augusti.', '25 000–75 000 kr', 'kontaktad', 45000],
    ['forelasning', 'Exempelgymnasiet', 'Alex Prov', 'Föreläsning för elever om hur man debatterar respektfullt.', 'Under 25 000 kr', 'ny', null],
  ];
  for (const [type, org, name, msg, budget, status, value] of leads) {
    run("INSERT INTO leads (type, organisation, name, email, budget, message, status, value_sek, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demo')", type, org, name, 'kontakt@exempel.se', budget, msg, status, value);
  }
});
// Besöksstatistik för konverteringstratten
const funnel = { view_home: 4200, view_apply: 860, apply_start: 520, apply_step_2: 410, apply_step_3: 330, apply_step_4: 260, apply_submit: 140, video_click: 610, subscribe: 95 };
for (const [e, n] of Object.entries(funnel)) track(e, n);
console.log(`Skapade ${made} fiktiva demoansökningar, 60 prenumeranter och 3 förfrågningar (taggade "demo").`);
console.log(`Totalt i databasen: ${get('SELECT COUNT(*) AS n FROM applications').n} ansökningar.`);
