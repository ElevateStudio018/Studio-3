import { config } from './config.js';
import { run, get, getSetting } from './db.js';

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Gemensam e-postlayout i Studio 3:s färger. */
export function layout({ title, body, cta, footer }) {
  const site = getSetting('site', {});
  const button = cta
    ? `<p style="margin:28px 0"><a href="${escapeHtml(cta.url)}" style="background:#F1944F;color:#1b0f05;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="sv"><body style="margin:0;background:#0d0d0e;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f5f2ee">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:900;font-size:28px;letter-spacing:.02em;color:#F1944F">S3.</div>
    <h1 style="font-size:24px;line-height:1.25;margin:24px 0 12px">${escapeHtml(title)}</h1>
    <div style="font-size:16px;line-height:1.6;color:#d8d3cc">${body}</div>
    ${button}
    <hr style="border:0;border-top:1px solid #2a2a2e;margin:32px 0">
    <p style="font-size:12px;color:#8d8880;line-height:1.5">${footer || `${escapeHtml(site.name || 'STUDIO 3')} · Debatten börjar här · <a style="color:#8d8880" href="${config.siteUrl}">${config.siteUrl.replace(/^https?:\/\//, '')}</a>`}</p>
  </div></body></html>`;
}

/**
 * Skickar via Resend om RESEND_API_KEY finns, annars hamnar mejlet i utkorgen
 * (synlig i admin) så att inget försvinner under utveckling.
 */
export async function sendMail({ to, subject, html, kind }) {
  const { lastInsertRowid } = run('INSERT INTO outbox (to_email, subject, html, kind) VALUES (?, ?, ?, ?)', to, subject, html, kind || null);
  if (!config.mail.resendKey) {
    run("UPDATE outbox SET status = 'loggad' WHERE id = ?", lastInsertRowid);
    return { ok: true, logged: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject, html }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    run("UPDATE outbox SET status = 'skickad', provider_id = ?, sent_at = datetime('now') WHERE id = ?", data.id || null, lastInsertRowid);
    return { ok: true };
  } catch (err) {
    run("UPDATE outbox SET status = 'fel', error = ? WHERE id = ?", String(err.message || err), lastInsertRowid);
    return { ok: false, error: String(err.message || err) };
  }
}

/** Kör utskick i bakgrunden i små omgångar för att inte slå i leverantörens gränser. */
export function sendBulk(messages) {
  let i = 0;
  const next = async () => {
    const batch = messages.slice(i, i + 8);
    i += batch.length;
    await Promise.all(batch.map((m) => sendMail(m)));
    if (i < messages.length) setTimeout(next, config.mail.resendKey ? 1200 : 0);
  };
  if (messages.length) setTimeout(next, 0);
}

export const templates = {
  applicationReceived(app, debate) {
    return {
      subject: `Vi har tagit emot din ansökan (${app.ref})`,
      html: layout({
        title: `Tack ${escapeHtml(app.name.split(' ')[0])} – din ansökan är inne!`,
        body: `<p>Du har sökt till <strong>${escapeHtml(debate ? debate.title : 'Studio 3:s talangbank')}</strong>. Ditt referensnummer är <strong>${escapeHtml(app.ref)}</strong>.</p>
               <p>Vi läser alla ansökningar själva. Om du går vidare ringer eller mejlar vi dig${debate?.deadline ? ` efter att ansökan stänger ${escapeHtml(debate.deadline.slice(0, 10))}` : ''}. Hör du inget har vi tyvärr valt andra den här gången – men din ansökan kan ändå komma att användas till framtida debatter om du godkänt det.</p>
               <p>Vill du ändra något eller ta bort din ansökan? Svara bara på det här mejlet.</p>`,
      }),
    };
  },
  newApplicationNotice(app, debate) {
    return {
      subject: `Ny ansökan: ${app.name} → ${debate ? debate.title : 'Talangbanken'}`,
      html: layout({
        title: 'Ny ansökan',
        body: `<p><strong>${escapeHtml(app.name)}</strong> (${escapeHtml(app.party || 'inget parti angivet')}, ${escapeHtml(app.municipality || '')}) har sökt till ${escapeHtml(debate ? debate.title : 'talangbanken')}.</p>
               <p>Matchningspoäng: <strong>${app.score}</strong></p>`,
        cta: { label: 'Öppna i admin', url: `${config.siteUrl}/admin/#/ansokningar/${app.id}` },
      }),
    };
  },
  invite(app, debate, message) {
    return {
      subject: `Du är uttagen till ${debate ? debate.title : 'Studio 3'}!`,
      html: layout({
        title: `Grattis ${escapeHtml(app.name.split(' ')[0])}!`,
        body: `<p>Vi vill gärna ha med dig i <strong>${escapeHtml(debate ? debate.title : 'en kommande debatt')}</strong>.</p>
               ${debate?.event_at ? `<p><strong>När:</strong> ${escapeHtml(debate.event_at.replace('T', ' kl. '))}<br><strong>Var:</strong> ${escapeHtml(debate.location || 'meddelas')}</p>` : ''}
               ${message ? `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
               <p>Svara på det här mejlet så snart du kan och bekräfta att du kommer.</p>`,
      }),
    };
  },
  reject(app, debate) {
    return {
      subject: `Angående din ansökan till ${debate ? debate.title : 'Studio 3'}`,
      html: layout({
        title: `Hej ${escapeHtml(app.name.split(' ')[0])}`,
        body: `<p>Tack för att du sökte till <strong>${escapeHtml(debate ? debate.title : 'Studio 3')}</strong>. Vi fick in väldigt många bra ansökningar och har den här gången valt andra deltagare.</p>
               <p>Fortsätt gärna söka – nya debatter publiceras hela tiden.</p>`,
        cta: { label: 'Se öppna debatter', url: `${config.siteUrl}/#debatter` },
      }),
    };
  },
  confirmSubscription(sub) {
    return {
      subject: 'Bekräfta ditt nyhetsbrev från STUDIO 3',
      html: layout({
        title: 'Ett klick kvar!',
        body: '<p>Bekräfta din e-postadress så hör vi av oss när nya debatter öppnar för ansökan och när nya avsnitt släpps.</p>',
        cta: { label: 'Bekräfta prenumerationen', url: `${config.siteUrl}/nyhetsbrev/bekrafta?token=${encodeURIComponent(sub.token)}` },
      }),
    };
  },
  newsletter(sub, subject, bodyHtml) {
    return {
      subject,
      html: layout({
        title: subject,
        body: bodyHtml,
        footer: `Du får det här mejlet för att du prenumererar på STUDIO 3. <a style="color:#8d8880" href="${config.siteUrl}/nyhetsbrev/avsluta?token=${encodeURIComponent(sub.token)}">Avsluta prenumerationen</a>.`,
      }),
    };
  },
  leadReceived(lead) {
    return {
      subject: 'Tack för din förfrågan till STUDIO 3',
      html: layout({
        title: `Tack ${escapeHtml(lead.name.split(' ')[0])}!`,
        body: '<p>Vi har tagit emot din förfrågan och återkommer inom två arbetsdagar.</p>',
      }),
    };
  },
};

export function notifyAdmins(message) {
  const to = config.mail.notify || getSetting('site', {}).notifyEmail;
  if (to) sendMail({ ...message, to, kind: 'notis' });
}

export const outboxCount = () => get('SELECT COUNT(*) AS n FROM outbox').n;
