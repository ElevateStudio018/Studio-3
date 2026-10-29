import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  siteUrl: (env.SITE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  publicDir: path.join(ROOT, 'public'),
  contentDir: path.join(ROOT, 'content'),
  adminEmail: (env.ADMIN_EMAIL || 'admin@studio3.se').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',
  // Sätt COOKIE_SECURE=1 i produktion bakom HTTPS.
  cookieSecure: env.COOKIE_SECURE === '1' || (env.SITE_URL || '').startsWith('https://'),
  ipSalt: env.IP_SALT || 'studio3-salt-byt-mig',
  mail: {
    resendKey: env.RESEND_API_KEY || '',
    from: env.MAIL_FROM || 'STUDIO 3 <debatt@studio3.se>',
    notify: env.NOTIFY_EMAIL || '',
  },
  youtube: {
    channelId: env.YOUTUBE_CHANNEL_ID || 'UCq0WPjQ9K4beFTYSQFx_rSQ',
    apiKey: env.YOUTUBE_API_KEY || '',
    syncMinutes: Number(env.YOUTUBE_SYNC_MINUTES || 30),
    disabled: env.YOUTUBE_SYNC === '0',
  },
};
