// utils/mailer.js — sends email (verification codes, security alerts, digests).
//
// Configure in backend/.env, either:
//   SMTP_URL=smtps://user:pass@smtp.example.com:465
// or
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=you@gmail.com  SMTP_PASS=<app password>  (SMTP_SECURE=true)
//   MAIL_FROM="Streamix <you@gmail.com>"      APP_URL=https://your-streamix-address   (for links in emails)
//
// Without SMTP settings nothing leaves the server: each email is printed to the server log instead
// (so a household server still works — the admin can read the code there, or mark the account verified).
// Transient failures (timeouts, 4xx greylisting) are retried with backoff; permanent ones (5xx) are not.
const nodemailer = require('nodemailer')

let transport = null
let transportKey = ''

function configured() {
  return !!(process.env.SMTP_URL || (process.env.SMTP_HOST && process.env.SMTP_USER))
}

function getTransport() {
  const keyNow = [process.env.SMTP_URL, process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USER].join('|')
  if (transport && keyNow === transportKey) return transport
  transportKey = keyNow
  const common = { pool: true, maxConnections: 3, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }
  if (process.env.SMTP_URL) transport = nodemailer.createTransport(process.env.SMTP_URL, common)
  else {
    const port = Number(process.env.SMTP_PORT) || 587
    transport = nodemailer.createTransport({
      ...common, host: process.env.SMTP_HOST, port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transport
}

const from = () => process.env.MAIL_FROM || (process.env.SMTP_USER ? `Streamix <${process.env.SMTP_USER}>` : 'Streamix <no-reply@streamix.local>')

/** Retry only what might work next time */
function transient(e) {
  const code = Number(e?.responseCode)
  if (code >= 500 && code < 600) return false        // mailbox doesn't exist, rejected, etc.
  if (e?.code === 'EAUTH' || e?.code === 'EENVELOPE') return false
  return true                                        // timeouts, connection drops, 4xx greylisting
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Send one email. → { ok: true, id, dev? } | { ok: false, permanent, error }
 * Retries up to `tries` times for transient errors (1 s, 4 s …).
 */
async function send({ to, subject, text, html }, tries = 3) {
  if (!configured()) {
    console.log(`\n[mail] SMTP isn't set up — this email was not sent. To: ${to}\n  Subject: ${subject}\n  ${String(text).split('\n').join('\n  ')}\n`)
    return { ok: true, dev: true }
  }
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const info = await getTransport().sendMail({ from: from(), to, subject, text, html })
      return { ok: true, id: info.messageId }
    } catch (e) {
      last = e
      if (!transient(e)) break
      if (i < tries - 1) await sleep(1000 * 4 ** i)
    }
  }
  console.warn('[mail] could not send to', to, '—', last?.message)
  return { ok: false, permanent: !transient(last), error: last?.message || 'send failed' }
}

// ── Templates ───────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function layout(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#0a0e17;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#dfe2ef">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e17;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#181b25;border-radius:16px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:1px solid #262a34"><span style="font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#e50914">STREAMIX</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff">${esc(title)}</h1>
${inner}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #262a34;font-size:12px;color:#8a8fa3">You're getting this because of your Streamix account. If you didn't expect it, you can ignore it.</td></tr>
</table></td></tr></table></body></html>`
}

const button = (href, label) => `<p style="margin:22px 0 0"><a href="${esc(href)}" style="display:inline-block;background:#e50914;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(label)}</a></p>`

const templates = {
  /** { code, link, username, purpose: 'signup' | 'change' } */
  verify: (d) => {
    const signup = d.purpose !== 'change'
    const title = signup ? 'Confirm your email' : 'Confirm your new email'
    const lead = signup ? `Hi ${d.username || 'there'}, enter this code to finish creating your Streamix account:` : 'Enter this code in Streamix to switch your account to this address:'
    return {
      subject: `${d.code} is your Streamix code`,
      text: `${title}\n\n${lead}\n\n${d.code}\n\nIt works for 15 minutes.${d.link ? `\nOr open this link: ${d.link}` : ''}\n\nIf you didn't ask for this, ignore this email — nothing will change.`,
      html: layout(title, `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#c3c6d4">${esc(lead)}</p>
<p style="margin:0;font-size:34px;font-weight:900;letter-spacing:10px;color:#ffffff;font-family:SFMono-Regular,Consolas,monospace">${esc(d.code)}</p>
<p style="margin:14px 0 0;font-size:13px;color:#8a8fa3">It works for 15 minutes.</p>${d.link ? button(d.link, 'Confirm my email') : ''}`),
    }
  },
  /** { title, body, link, when } */
  security: (d) => ({
    subject: `Security alert: ${d.title}`,
    text: `${d.title}\n\n${d.body}\n${d.when ? `\nWhen: ${d.when}` : ''}\n\nIf this was you, there's nothing to do. If not, change your password now${d.link ? `: ${d.link}` : ''}.`,
    html: layout(d.title, `<p style="margin:0;font-size:15px;line-height:1.5;color:#c3c6d4">${esc(d.body)}</p>
${d.when ? `<p style="margin:12px 0 0;font-size:13px;color:#8a8fa3">${esc(d.when)}</p>` : ''}
<p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:#c3c6d4">If this was you, there's nothing to do. If not, change your password right away.</p>${d.link ? button(d.link, 'Review account security') : ''}`),
  }),
  /** { name, items: [{ title, body, link }], link } */
  digest: (d) => ({
    subject: d.items.length === 1 ? d.items[0].title : `${d.items.length} things waiting for you on Streamix`,
    text: `This week on Streamix\n\n${d.items.map(i => `• ${i.title}${i.body ? ` — ${i.body}` : ''}${i.link ? `\n  ${i.link}` : ''}`).join('\n')}\n\nTurn these emails off in Account → Notifications.`,
    html: layout(`This week on Streamix${d.name ? `, ${d.name}` : ''}`, d.items.map(i => `<p style="margin:0 0 14px;font-size:15px;line-height:1.45">
<a href="${esc(i.link || d.link)}" style="color:#ffffff;font-weight:700;text-decoration:none">${esc(i.title)}</a>${i.body ? `<br><span style="color:#8a8fa3;font-size:13px">${esc(i.body)}</span>` : ''}</p>`).join('')
      + (d.link ? button(d.link, 'Open Streamix') : '') + `<p style="margin:18px 0 0;font-size:12px;color:#8a8fa3">Turn these emails off in Account → Notifications.</p>`),
  }),
}

/** send by template name */
async function sendTemplate(name, to, data, tries) {
  const t = templates[name](data)
  return send({ to, subject: t.subject, text: t.text, html: t.html }, tries)
}

/**
 * Public base URL for links in emails — only from APP_URL. Never from the request's Host header: a forged
 * Host would put an attacker's site in a real person's "confirm" link and hand them the code.
 * Without APP_URL, emails carry the code alone (which is all the app needs).
 */
function appUrl() {
  return process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, '') : ''
}

module.exports = { send, sendTemplate, configured, appUrl, templates, _test: { transient } }
