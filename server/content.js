// Standardtexter för sajten. Allt här kan ändras i admin under "Innehåll".
import { loadChannel } from './youtube.js';

export function defaultSite() {
  const ch = loadChannel();
  return {
    name: 'STUDIO 3',
    slogan: 'Olika åsikter.\nSamma rum.',
    subline: 'Politiker, väljare och opinionsbildare – ansikte mot ansikte. Utan manus. Utan mellanhänder.',
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
      lead: 'STUDIO 3 sätter människor med helt olika åsikter i samma rum – och låter kamerorna rulla.',
      story: [
        'Kanalen startades av Simon Claesson och Emil Widén och började som en humorkanal på YouTube. Det som hände sedan gick fort: när de satte politiker, väljare och opinionsbildare mitt emot varandra exploderade intresset.',
        'I dag har STUDIO 3 över 100 000 prenumeranter och nästan 20 miljoner visningar. Statsministern, partiledare, ministrar och partisekreterare har suttit i våra stolar – liksom hundratals vanliga väljare.',
        'Under valåret 2026 sände vi en egen valvaka live, och på Stortorget i Örebro samlade en livedebatt runt 300 personer. Nästa steg är fler livedebatter, fler format och fler röster som annars aldrig får plats.',
      ],
      why: [
        { title: 'Prata med – inte om', text: 'I ett polariserat Sverige pratar vi mest om varandra, i kommentarsfält och flöden. Hos oss sitter man mitt emot den man inte håller med – och måste lyssna.' },
        { title: 'Samma stol för alla', text: 'En minister och en förstagångsväljare får samma stol, samma mikrofon och samma tid. Argumenten får avgöra – inte titeln.' },
        { title: 'Gap och skrik säljer inte', text: 'Vi letar efter de riktiga argumenten och de ärliga ögonblicken. Det hetsiga är bara bra när det leder någonstans.' },
        { title: 'Politik där unga faktiskt är', text: 'Våra format är byggda för YouTube, TikTok och Instagram – så att debatten når de som sällan ser en traditionell tv-debatt.' },
      ],
    },
    team: ch.team,
    steps: [
      { title: 'Sök', text: 'Välj en öppen debatt eller anmäl dig till talangbanken. Det tar fem minuter.' },
      { title: 'Vi hör av oss', text: 'Vi läser varje ansökan och ringer de vi vill träffa för ett kort samtal.' },
      { title: 'Inspelning', text: 'Du får tid, plats och allt du behöver veta. Inget manus – bara du och dina argument.' },
      { title: 'Publicering', text: 'Avsnittet släpps på YouTube och i våra sociala kanaler. Dela det med alla du känner.' },
    ],
    faq: [
      { q: 'Måste jag vara medlem i ett parti?', a: 'Nej. De flesta som söker är vanliga väljare. Vi frågar om partisympati och uppdrag för att kunna sätta ihop en balanserad grupp – inte för att sålla bort någon.' },
      { q: 'Hur gammal måste jag vara?', a: 'Du måste ha fyllt 18 år för att söka.' },
      { q: 'Får jag betalt?', a: 'Det står i varje debattannons om det utgår ersättning eller reseersättning.' },
      { q: 'Blir jag filmad?', a: 'Ja. Debatterna spelas in och publiceras på YouTube och i sociala medier. Om du blir uttagen går vi igenom allt i detalj innan inspelningen.' },
      { q: 'Hur hanterar ni mina uppgifter?', a: 'Politisk åsikt är känsliga personuppgifter. Vi sparar dem bara med ditt uttryckliga samtycke, använder dem enbart för urval och raderar ansökningar automatiskt efter en bestämd tid. Du kan när som helst be oss radera dem.' },
      { q: 'Kan jag söka flera gånger?', a: 'Absolut. Sök gärna till flera debatter – och anmäl dig till talangbanken så hör vi av oss när något passar dig.' },
    ],
    partner: {
      title: 'Nå Sveriges mest engagerade unga publik',
      text: 'Integrerade samarbeten, sponsrade format, livedebatter på event och skolor eller en egen debattserie – vi tar fram upplägget tillsammans.',
      offers: [
        { title: 'Sponsrat avsnitt', text: 'Ert varumärke som presentatör av ett avsnitt eller en hel säsong.' },
        { title: 'Livedebatt', text: 'Vi tar studion till er scen – festival, Almedalen, skola eller kommun.' },
        { title: 'Egen debattserie', text: 'Ett skräddarsytt format kring en fråga ni vill lyfta.' },
        { title: 'Moderering & föreläsning', text: 'Simon och Emil leder er debatt eller berättar hur man bygger en kanal som engagerar.' },
      ],
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
  '1vs20': { people: '1 + 20', rules: ['En känd profil sätter sig i mitten.', 'Tjugo personer med motsatt åsikt sitter runt hen och turas om att fråga och argumentera.', 'Ingen moderator räddar någon – det är personen i mitten som måste svara.'] },
  soffan: { people: '6', rules: ['Ett aktuellt ämne och sex gäster från olika läger.', 'Samtalet får ta tid – här möts argumenten på djupet.', 'Ämnen från bistånd och klimat till abort, migration och public service.'] },
  duellen: { people: '2', rules: ['Två debattörer möts vid samma bord.', 'Ministrar, partisekreterare, ungdomsförbund och opinionsbildare.', 'Öga mot öga – argument mot argument.'] },
  partiledare: { people: '1 + 20', rules: ['En partiledare möter tjugo väljare.', 'Väljarna ställer sina egna frågor – inga förberedda journalistfrågor.', 'Ulf Kristersson, Simona Mohamsson och Daniel Helldén har suttit i stolen.'] },
  panelen: { people: '2 + 2', rules: ['Två lag från två partier eller läger.', 'Två mot två – en lagdebatt där argumenten bollas.', 'S mot SD, S mot M, SD mot MP och KD mot C hittills.'] },
  valvakan: { people: 'Live', rules: ['Kanalens egen valvaka under valet 2026.', 'Fem debatter, samtal med Markus Allard och livesändning hela kvällen.', 'Livesändningen har över 170 000 visningar.'] },
  banditer: { people: 'Varierar', rules: ['När vi lämnar studion.', 'Utmaningar, en dag i någon annans skor och möten utanför politiken.', 'Till exempel en dag som Alexander Ernstberger och att byta liv med tre kändisar.'] },
};

export const TIMELINE = [
  ['2023', 'YouTube-kanalen STUDIO 3 skapas av Simon Claesson och Emil Widén – först med humor som tema.'],
  ['Debatten tar över', 'Formaten 1 mot 20, Duellen och Studio Soffan sätter människor med helt olika åsikter i samma rum.'],
  ['1 000 000', 'Jan Emanuel mot 20 miljöpartister blir kanalens första avsnitt med en miljon visningar.'],
  ['Statsministern', 'Ulf Kristersson möter 20 väljare – liksom fler partiledare efter honom.'],
  ['100 000', 'Kanalen passerar 100 000 prenumeranter.'],
  ['Valet 2026', 'Egen valvaka live och en livedebatt på Stortorget i Örebro inför runt 300 personer.'],
];

export const PARTNER_PROCESS = [
  ['Kontakt', 'Ni berättar vad ni vill uppnå. Vi återkommer inom två arbetsdagar.'],
  ['Upplägg', 'Vi föreslår format, tider, budget och hur samarbetet syns.'],
  ['Produktion', 'Vi spelar in i studion eller på er plats – med vår redaktion och teknik.'],
  ['Publicering', 'Avsnittet släpps i våra kanaler och ni får en uppföljning av resultatet.'],
];

export const PARTNER_EXAMPLE = 'Inför valet 2026 tog vi studion ut på Stortorget i Örebro. Markus Allard (Örebropartiet) mötte John Johansson (S) inför runt 300 personer – modererat av Simon och Emil. Vill ni ha en livedebatt på er festival, skola, kommun eller konferens? Vi tar med format, moderatorer och publikengagemang.';
