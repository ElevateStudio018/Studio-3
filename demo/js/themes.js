// De 20 stilpaketen. Delas av servern (som injicerar aktivt paket i HTML) och
// av webbläsaren (stilpaket-sidan och förhandsvisning via ?stil=<id>).

const base = {
  radius: '14px',
  radiusLg: '26px',
  displayWeight: '900',
  displayStretch: '100%',
  displayCase: 'uppercase',
  displayTracking: '-0.01em',
  displayStyle: 'normal',
  heroTint: 'rgba(8,8,10,.55)',
  border: 'rgba(255,255,255,.12)',
  shadow: '0 20px 60px rgba(0,0,0,.35)',
};

export const THEMES = [
  {
    id: 'studio', name: 'Studio 3 Original', tagline: 'Kanalens egna färger – mörk studio, orange signal.',
    bestFor: 'Standardvalet. Känns direkt igen av befintliga tittare.',
    fonts: 'family=Archivo:wdth,wght@62..125,400..900&family=Inter:wght@400;500;600;700',
    display: '"Archivo", sans-serif', body: '"Inter", system-ui, sans-serif',
    vars: { bg: '#0d0d0e', bg2: '#131315', surface: '#18181b', surface2: '#202024', text: '#f5f2ee', muted: '#a8a39c', accent: '#F1944F', accent2: '#ffcfa6', onAccent: '#1b0f05', displayStretch: '125%' },
    fx: ['grain'],
  },
  {
    id: 'riksdag', name: 'Riksdagen', tagline: 'Marinblått och guld. Seriöst, tryggt, institutionellt.',
    bestFor: 'När ni vill locka ministrar och partiledare – och sälja in er till public service.',
    fonts: 'family=Playfair+Display:wght@700;800;900&family=Source+Sans+3:wght@400;600;700',
    display: '"Playfair Display", serif', body: '"Source Sans 3", system-ui, sans-serif',
    vars: { bg: '#0a1530', bg2: '#0e1b3d', surface: '#132449', surface2: '#1a2e5a', text: '#f3efe4', muted: '#aab3c8', accent: '#c9a54c', accent2: '#ecd9a0', onAccent: '#1a1406', displayCase: 'none', displayTracking: '0', displayWeight: '800' },
    fx: [],
  },
  {
    id: 'breaking', name: 'Breaking News', tagline: 'Vitt, svart och nyhetsrött. Nyhetsflash-energi.',
    bestFor: 'Snabba, aktuella debatter och valår.',
    fonts: 'family=Oswald:wght@500;600;700&family=Roboto:wght@400;500;700',
    display: '"Oswald", sans-serif', body: '"Roboto", system-ui, sans-serif',
    vars: { bg: '#ffffff', bg2: '#f3f3f3', surface: '#ffffff', surface2: '#efefef', text: '#111111', muted: '#5c5c5c', accent: '#e10600', accent2: '#111111', onAccent: '#ffffff', border: 'rgba(0,0,0,.12)', radius: '4px', radiusLg: '6px', displayWeight: '700', shadow: '0 10px 30px rgba(0,0,0,.08)' },
    fx: ['ticker'],
  },
  {
    id: 'neon', name: 'Neon Debatt', tagline: 'Magenta och cyan som lyser i mörkret.',
    bestFor: 'Ung publik på TikTok och Shorts.',
    fonts: 'family=Unbounded:wght@600;800;900&family=Space+Grotesk:wght@400;500;700',
    display: '"Unbounded", sans-serif', body: '"Space Grotesk", system-ui, sans-serif',
    vars: { bg: '#07060d', bg2: '#0c0a18', surface: '#120f22', surface2: '#1a1530', text: '#f4f0ff', muted: '#a49cc4', accent: '#ff2bd6', accent2: '#19f0ff', onAccent: '#14001a', displayWeight: '800' },
    fx: ['glow'],
  },
  {
    id: 'nordisk', name: 'Nordisk Minimal', tagline: 'Ljust, luftigt och skandinaviskt stramt.',
    bestFor: 'Partners, annonsörer och en vuxnare målgrupp.',
    fonts: 'family=Inter+Tight:wght@500;700;800&family=Inter:wght@400;500;600',
    display: '"Inter Tight", sans-serif', body: '"Inter", system-ui, sans-serif',
    vars: { bg: '#f4f1ec', bg2: '#ebe7e0', surface: '#ffffff', surface2: '#f7f5f1', text: '#161616', muted: '#6b6760', accent: '#161616', accent2: '#d9622b', onAccent: '#ffffff', border: 'rgba(0,0,0,.1)', displayCase: 'none', displayTracking: '-0.035em', displayWeight: '800', shadow: '0 16px 40px rgba(0,0,0,.07)' },
    fx: [],
  },
  {
    id: 'valvaka', name: 'Valvaka', tagline: 'Svenskt blått och gult. Valnattens studio.',
    bestFor: 'Valår, valvakor och partiledardebatter.',
    fonts: 'family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600',
    display: '"Barlow Condensed", sans-serif', body: '"Barlow", system-ui, sans-serif',
    vars: { bg: '#001a3d', bg2: '#00214d', surface: '#022a5e', surface2: '#05346f', text: '#f5f8ff', muted: '#a9bbd8', accent: '#fecc02', accent2: '#6fb4ff', onAccent: '#0b1a33', displayWeight: '800', displayTracking: '0.01em' },
    fx: [],
  },
  {
    id: 'lopsedel', name: 'Löpsedel', tagline: 'Gul löpsedel, svart rubrik, rött utrop.',
    bestFor: 'Klickvänliga, provokativa avsnitt.',
    fonts: 'family=Anton&family=Roboto+Condensed:wght@400;600;700',
    display: '"Anton", sans-serif', body: '"Roboto Condensed", system-ui, sans-serif',
    vars: { bg: '#ffe500', bg2: '#ffd900', surface: '#ffffff', surface2: '#fff7b3', text: '#0d0d0d', muted: '#3d3a26', accent: '#e2001a', accent2: '#0d0d0d', onAccent: '#ffffff', border: 'rgba(0,0,0,.18)', radius: '0px', radiusLg: '0px', displayWeight: '400', shadow: '6px 6px 0 #0d0d0d' },
    fx: [],
  },
  {
    id: 'arena', name: 'Arenan', tagline: 'Sportsändning: limegrönt, kursivt och snabbt.',
    bestFor: 'Duellen och allt som känns som en match.',
    fonts: 'family=Saira+Condensed:wght@600;700;800&family=Saira:wght@400;500;600',
    display: '"Saira Condensed", sans-serif', body: '"Saira", system-ui, sans-serif',
    vars: { bg: '#090d09', bg2: '#0e140e', surface: '#131b13', surface2: '#1a241a', text: '#f1f7ec', muted: '#9eb098', accent: '#b6ff00', accent2: '#ffffff', onAccent: '#0b1200', displayStyle: 'italic', displayWeight: '800', radius: '6px', radiusLg: '10px' },
    fx: ['stripes'],
  },
  {
    id: 'brutalist', name: 'Brutalist', tagline: 'Rått, monospace och tjocka ramar.',
    bestFor: 'En kantig, ärlig ton som sticker ut från tv-debatten.',
    fonts: 'family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600',
    display: '"Space Mono", monospace', body: '"IBM Plex Mono", ui-monospace, monospace',
    vars: { bg: '#f2f2f2', bg2: '#e6e6e6', surface: '#ffffff', surface2: '#f7f7f7', text: '#000000', muted: '#444444', accent: '#ff3b00', accent2: '#000000', onAccent: '#ffffff', border: '#000000', radius: '0px', radiusLg: '0px', displayWeight: '700', displayTracking: '-0.04em', shadow: '8px 8px 0 #000' },
    fx: ['thick'],
  },
  {
    id: 'kultursidan', name: 'Kultursidan', tagline: 'Magasinskänsla: krämvitt, serif och vinrött.',
    bestFor: 'Djupare samtal och Studio Soffan.',
    fonts: 'family=Fraunces:opsz,wght@9..144,700;9..144,900&family=Newsreader:opsz,wght@6..72,400;6..72,600',
    display: '"Fraunces", serif', body: '"Newsreader", Georgia, serif',
    vars: { bg: '#f6f0e6', bg2: '#efe6d8', surface: '#fffaf2', surface2: '#f3ebdd', text: '#1b1a17', muted: '#6a6257', accent: '#9b1c1c', accent2: '#c0843a', onAccent: '#fff8ef', border: 'rgba(27,26,23,.14)', displayCase: 'none', displayTracking: '-0.02em', displayWeight: '900', shadow: '0 14px 40px rgba(60,40,10,.08)' },
    fx: [],
  },
  {
    id: 'galtan', name: 'GAL–TAN', tagline: 'Rött möter blått. Polariseringen som designidé.',
    bestFor: 'Kampanjer som spelar på vänster mot höger.',
    fonts: 'family=Big+Shoulders+Display:wght@700;800;900&family=Inter:wght@400;500;600',
    display: '"Big Shoulders Display", sans-serif', body: '"Inter", system-ui, sans-serif',
    vars: { bg: '#0f1020', bg2: '#141530', surface: '#191b38', surface2: '#212449', text: '#f4f5ff', muted: '#a3a7c9', accent: '#e63946', accent2: '#3a86ff', onAccent: '#ffffff', displayWeight: '900' },
    fx: ['split'],
  },
  {
    id: 'poddstudio', name: 'Poddstudio', tagline: 'Mjuka pasteller och runda former.',
    bestFor: 'Livsstil, relationer och lättare samtalsämnen.',
    fonts: 'family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700',
    display: '"Fredoka", sans-serif', body: '"Nunito", system-ui, sans-serif',
    vars: { bg: '#fff7f2', bg2: '#ffeee5', surface: '#ffffff', surface2: '#fff3ec', text: '#2a2238', muted: '#75698a', accent: '#ff7aa2', accent2: '#7fb2ff', onAccent: '#ffffff', border: 'rgba(42,34,56,.1)', radius: '22px', radiusLg: '34px', displayCase: 'none', displayWeight: '700', shadow: '0 18px 40px rgba(255,122,162,.15)' },
    fx: [],
  },
  {
    id: 'midnattssol', name: 'Midnattssol', tagline: 'Solnedgång i orange och magenta mot violett natt.',
    bestFor: 'Sommar, Almedalen och festivaldebatter.',
    fonts: 'family=Sora:wght@400;600;800',
    display: '"Sora", sans-serif', body: '"Sora", system-ui, sans-serif',
    vars: { bg: '#1a0b2e', bg2: '#22103b', surface: '#2a1446', surface2: '#341a55', text: '#fff3ea', muted: '#c7a9d6', accent: '#ff7a18', accent2: '#ff3d77', onAccent: '#2a0c00', displayWeight: '800', displayCase: 'none', displayTracking: '-0.03em' },
    fx: ['sunset'],
  },
  {
    id: 'glas', name: 'Glas', tagline: 'Frostat glas, djup bakgrund, mjukt ljus.',
    bestFor: 'En modern, premium tech-känsla.',
    fonts: 'family=Plus+Jakarta+Sans:wght@400;600;800',
    display: '"Plus Jakarta Sans", sans-serif', body: '"Plus Jakarta Sans", system-ui, sans-serif',
    vars: { bg: '#0b1220', bg2: '#0e1628', surface: 'rgba(255,255,255,.06)', surface2: 'rgba(255,255,255,.1)', text: '#eef4ff', muted: '#9fb0cc', accent: '#7dd3fc', accent2: '#c4b5fd', onAccent: '#04121c', displayCase: 'none', displayWeight: '800', displayTracking: '-0.03em', radius: '18px', radiusLg: '28px' },
    fx: ['glass'],
  },
  {
    id: 'retro-tv', name: 'Retro-TV', tagline: '80-talsstudio med scanlines och VHS-färger.',
    bestFor: 'Nostalgi, humor och Studio Banditer.',
    fonts: 'family=Rubik+Mono+One&family=IBM+Plex+Mono:wght@400;500;600',
    display: '"Rubik Mono One", monospace', body: '"IBM Plex Mono", ui-monospace, monospace',
    vars: { bg: '#120d16', bg2: '#181020', surface: '#1e1428', surface2: '#281a35', text: '#fdf1dc', muted: '#b59fb8', accent: '#ff5e3a', accent2: '#2de2e6', onAccent: '#1a0500', displayWeight: '400', radius: '4px', radiusLg: '8px' },
    fx: ['scanlines'],
  },
  {
    id: 'maxkontrast', name: 'Maxkontrast', tagline: 'Svart, vitt och signalgult. Maximal läsbarhet.',
    bestFor: 'Tillgänglighet (WCAG AAA) och äldre tittare.',
    fonts: 'family=Atkinson+Hyperlegible:wght@400;700',
    display: '"Atkinson Hyperlegible", sans-serif', body: '"Atkinson Hyperlegible", system-ui, sans-serif',
    vars: { bg: '#000000', bg2: '#0a0a0a', surface: '#111111', surface2: '#1c1c1c', text: '#ffffff', muted: '#e0e0e0', accent: '#ffe600', accent2: '#ffffff', onAccent: '#000000', border: 'rgba(255,255,255,.5)', displayWeight: '700' },
    fx: ['bigfocus'],
  },
  {
    id: 'folkrorelse', name: 'Folkrörelse', tagline: 'Skogsgrönt och senapsgult. Jordnära och folkligt.',
    bestFor: 'Lokala debatter, landsbygd och turnéer.',
    fonts: 'family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Work+Sans:wght@400;500;600',
    display: '"Bricolage Grotesque", sans-serif', body: '"Work Sans", system-ui, sans-serif',
    vars: { bg: '#0f1f17', bg2: '#13271d', surface: '#183024', surface2: '#1f3b2d', text: '#f2efe3', muted: '#a9b8a6', accent: '#e9c46a', accent2: '#2a9d8f', onAccent: '#1d1600', displayCase: 'none', displayWeight: '800', displayTracking: '-0.02em' },
    fx: [],
  },
  {
    id: 'rott-svart', name: 'Rött & svart', tagline: 'Bara två färger. Maximal dramatik.',
    bestFor: 'Konfrontativa format som 1 mot 20.',
    fonts: 'family=Bebas+Neue&family=Inter:wght@400;500;600',
    display: '"Bebas Neue", sans-serif', body: '"Inter", system-ui, sans-serif',
    vars: { bg: '#0a0a0a', bg2: '#101010', surface: '#151515', surface2: '#1d1d1d', text: '#ffffff', muted: '#a3a3a3', accent: '#ff1f1f', accent2: '#ffffff', onAccent: '#ffffff', displayWeight: '400', displayTracking: '0.01em', radius: '2px', radiusLg: '4px' },
    fx: [],
  },
  {
    id: 'premium', name: 'Premium', tagline: 'Svart och guld med elegant serif.',
    bestFor: 'Sponsorpitchar, gala och betalda partnerskap.',
    fonts: 'family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;500;700',
    display: '"Cormorant Garamond", serif', body: '"Manrope", system-ui, sans-serif',
    vars: { bg: '#0c0b09', bg2: '#12100d', surface: '#181511', surface2: '#211d17', text: '#f4ede0', muted: '#b3a790', accent: '#d4af37', accent2: '#f1e2b0', onAccent: '#171204', displayCase: 'none', displayWeight: '700', displayTracking: '0', radius: '2px', radiusLg: '4px' },
    fx: [],
  },
  {
    id: 'gen-z', name: 'Gen Z', tagline: 'Lime, rosa och lekfull typografi. Y2K-energi.',
    bestFor: 'Förstagångsväljare och skolturnéer.',
    fonts: 'family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700',
    display: '"Syne", sans-serif', body: '"DM Sans", system-ui, sans-serif',
    vars: { bg: '#0b0b0b', bg2: '#121212', surface: '#171717', surface2: '#202020', text: '#fafafa', muted: '#a1a1a1', accent: '#c6ff00', accent2: '#ff4fd8', onAccent: '#0b0b0b', displayWeight: '800', radius: '20px', radiusLg: '30px' },
    fx: ['sticker'],
  },
];

export const DEFAULT_THEME = 'studio';

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

const CSS_NAMES = {
  bg: '--bg', bg2: '--bg-2', surface: '--surface', surface2: '--surface-2', text: '--text', muted: '--muted',
  accent: '--accent', accent2: '--accent-2', onAccent: '--on-accent', border: '--border', radius: '--radius',
  radiusLg: '--radius-lg', displayWeight: '--display-weight', displayStretch: '--display-stretch',
  displayCase: '--display-case', displayTracking: '--display-tracking', displayStyle: '--display-style',
  heroTint: '--hero-tint', shadow: '--shadow',
};

export function themeVars(theme) {
  const v = { ...base, ...theme.vars };
  const out = { '--font-display': theme.display, '--font-body': theme.body };
  for (const [k, name] of Object.entries(CSS_NAMES)) if (v[k] != null) out[name] = v[k];
  return out;
}

export function themeCss(theme, selector = ':root') {
  const vars = themeVars(theme);
  return `${selector}{${Object.entries(vars).map(([k, val]) => `${k}:${val}`).join(';')}}`;
}

export function fontsHref(theme) {
  return `https://fonts.googleapis.com/css2?${theme.fonts}&display=swap`;
}

/** Är bakgrunden ljus? Används för att välja logotypvariant m.m. */
export function isLight(theme) {
  const hex = (theme.vars.bg || '#000').replace('#', '');
  if (hex.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

export function applyTheme(theme, root = document.documentElement) {
  for (const [k, val] of Object.entries(themeVars(theme))) root.style.setProperty(k, val);
  root.dataset.theme = theme.id;
  root.dataset.tone = isLight(theme) ? 'light' : 'dark';
  root.dataset.fx = theme.fx.join(' ');
  let link = document.getElementById('theme-fonts');
  if (!link) {
    link = document.createElement('link');
    link.id = 'theme-fonts';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = fontsHref(theme);
}
