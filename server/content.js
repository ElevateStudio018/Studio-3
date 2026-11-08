// Standardtexter för sajten. Allt här kan ändras i admin under "Innehåll".
import { loadChannel } from './youtube.js';

export function defaultSite() {
  const ch = loadChannel();
  return {
    name: 'STUDIO 3',
    slogan: 'Olika åsikter.\nSamma rum.',
    subline: 'Debatter på YouTube med politiker, opinionsbildare och vanliga väljare.',
    endline: 'Debatten börjar här.',
    announcement: '',
    heroVideo: '/assets/video/hero.mp4',
    heroVideoMobile: '/assets/video/hero-mobile.mp4',
    heroPoster: '/assets/video/hero-poster.jpg',
    heroMode: 'youtube',
    heroClips: [],
    heroIntroEnd: 2.25,
    heroEndAt: 18.9,
    theme: 'studio',
    contactEmail: '',
    swish: '',
    notifyEmail: '',
    retentionMonths: 12,
    autoNotifyVideos: false,
    socials: ch.channel.socials,
    about: {
      lead: 'STUDIO 3 är en YouTube-kanal med politiska debatter.',
      story: [
        'Kanalen drivs av Simon Claesson och Emil Widén. Den startade 2023 som en humorkanal och blev en debattkanal när de började sätta människor med olika åsikter mot varandra.',
        'Ulf Kristersson, Nooshi Dadgostar, Mikael Damberg och Jan Emanuel är några av dem som har varit med, tillsammans med många vanliga väljare. Kanalen har över 100 000 prenumeranter.',
        'Under valet 2026 sände vi en valvaka och höll en livedebatt på Stortorget i Örebro.',
      ],
      why: [],
    },
    team: ch.team,
    steps: [
      { title: 'Sök', text: 'Fyll i formuläret. Det tar några minuter.' },
      { title: 'Vi hör av oss', text: 'Vi ringer eller mejlar dem vi vill ha med.' },
      { title: 'Inspelning', text: 'Du får tid och plats i god tid.' },
    ],
    faq: [
      { q: 'Måste jag vara med i ett parti?', a: 'Nej. Vi frågar om partisympati för att få en blandad grupp.' },
      { q: 'Hur gammal måste jag vara?', a: 'Minst 18 år.' },
      { q: 'Blir jag filmad?', a: 'Ja. Debatterna publiceras på YouTube och i sociala medier.' },
      { q: 'Vad händer med mina uppgifter?', a: 'De används bara till urvalet och raderas efter 12 månader. Svara på bekräftelsemejlet om du vill att vi tar bort dem tidigare.' },
    ],
    partner: {
      title: 'Samarbeten',
      text: 'Vi gör sponsrade avsnitt, livedebatter på event och skolor och egna debattserier. Hör av er så berättar vi mer.',
      offers: [],
    },
  };
}

export const FORMAT_NAMES = {
  '1vs20': '1 mot 20', soffan: 'Studio Soffan', duellen: 'Duellen', partiledare: 'Partiledare vs 20 väljare',
  panelen: 'Panelen', valvakan: 'Valvakan', banditer: 'Studio Banditer', kommentarer: 'Svarar på kommentarer',
  publik: 'Publikplats', ovrigt: 'Övrigt',
};

export const PARTIES = [
  { id: 'S', name: 'Socialdemokraterna' }, { id: 'M', name: 'Moderaterna' }, { id: 'SD', name: 'Sverigedemokraterna' },
  { id: 'V', name: 'Vänsterpartiet' }, { id: 'C', name: 'Centerpartiet' }, { id: 'KD', name: 'Kristdemokraterna' },
  { id: 'L', name: 'Liberalerna' }, { id: 'MP', name: 'Miljöpartiet' }, { id: 'ANNAT', name: 'Annat parti' },
  { id: 'OSAKER', name: 'Osäker / inget parti' }, { id: 'EJ', name: 'Vill inte uppge' },
];

export const COUNTIES = ['Blekinge', 'Dalarna', 'Gotland', 'Gävleborg', 'Halland', 'Jämtland', 'Jönköping', 'Kalmar', 'Kronoberg',
  'Norrbotten', 'Skåne', 'Stockholm', 'Södermanland', 'Uppsala', 'Värmland', 'Västerbotten', 'Västernorrland', 'Västmanland',
  'Västra Götaland', 'Örebro', 'Östergötland'];

export const APP_STATUSES = [
  { id: 'ny', name: 'Ny' }, { id: 'granskad', name: 'Granskad' }, { id: 'shortlist', name: 'Shortlist' },
  { id: 'intervju', name: 'Intervju' }, { id: 'uttagen', name: 'Uttagen' }, { id: 'bekraftad', name: 'Bekräftad' },
  { id: 'reserv', name: 'Reserv' }, { id: 'nej', name: 'Nej tack' },
];

export const DEBATE_STATUSES = [
  { id: 'draft', name: 'Utkast' }, { id: 'open', name: 'Öppen för ansökan' }, { id: 'closed', name: 'Stängd' },
  { id: 'recorded', name: 'Inspelad' }, { id: 'published', name: 'Publicerad' },
];

/** Mer om varje format – regler och antal deltagare. */
export const FORMAT_INFO = {
  '1vs20': { people: '1 + 20', rules: ['En känd person sitter i mitten.', 'Tjugo personer som tycker annorlunda ställer frågor och argumenterar.'] },
  soffan: { people: '6', rules: ['Sex gäster från olika håll.', 'Ett ämne per avsnitt.'] },
  duellen: { people: '2', rules: ['Två debattörer vid samma bord.', 'Ofta politiker från olika partier eller ungdomsförbund.'] },
  partiledare: { people: '1 + 20', rules: ['En partiledare i mitten.', 'Tjugo väljare med egna frågor.'] },
  panelen: { people: '2 + 2', rules: ['Två lag från olika partier eller läger.'] },
  valvakan: { people: 'Live', rules: ['Sändes live under valnatten 2026.', 'Fem debatter och ett samtal med Markus Allard.'] },
  banditer: { people: 'Varierar', rules: ['Avsnitt utanför studion.'] },
};

export const TIMELINE = [
  ['2023', 'Kanalen startar på YouTube.'],
  ['1 000 000', 'Jan Emanuel mot 20 miljöpartister blir kanalens mest sedda avsnitt.'],
  ['100 000', 'Kanalen passerar 100 000 prenumeranter.'],
  ['Valet 2026', 'Valvaka live och livedebatt på Stortorget i Örebro.'],
];

export const PARTNER_PROCESS = [
  ['Kontakt', 'Ni berättar vad ni vill göra.'],
  ['Förslag', 'Vi föreslår upplägg, datum och pris.'],
  ['Inspelning', 'I studion eller på plats hos er.'],
];

export const PARTNER_EXAMPLE = 'Inför valet 2026 höll vi en livedebatt på Stortorget i Örebro mellan Markus Allard (Örebropartiet) och John Johansson (S). Runt 300 personer kom.';
