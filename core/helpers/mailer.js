const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    // No SMTP configured — fall back to a JSON transport so mail-sending code paths keep
    // working end-to-end in dev without a real mail server; nothing actually leaves the box.
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

const templates = {};

// registerTemplate('welcome', (data) => ({ subject: `Hi ${data.name}`, html: `...` }))
// Register templates once at app startup (see app/config/mail.js).
function registerTemplate(name, build) {
  templates[name] = build;
}

async function send(templateName, to, data = {}) {
  const build = templates[templateName];
  if (!build) throw new Error(`Unknown mail template "${templateName}". Register it with mailer.registerTemplate() first.`);
  const { subject, html } = build(data);
  return getTransporter().sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}

// Fire-and-forget variant — use this from controllers/services so a slow or failed mail send
// never blocks or fails the HTTP response it was triggered from.
function sendAsync(templateName, to, data = {}) {
  setImmediate(() => {
    send(templateName, to, data).catch((err) => logger.error(`Mail send failed (${templateName} -> ${to}): ${err.message}`));
  });
}

module.exports = { registerTemplate, send, sendAsync };
