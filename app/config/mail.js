// Registered once at startup (required from server.js) so `mailer.send('welcome', ...)` /
// `mailer.sendAsync(...)` work anywhere in the app. Add one registerTemplate() call per email
// your app sends.
const mailer = require('../../core/helpers/mailer');

mailer.registerTemplate('welcome', (data) => ({
  subject: `Welcome to ${process.env.APP_NAME || 'Forge MVC'}, ${data.name}!`,
  html: `<p>Hi ${data.name},</p><p>Your account has been created. Happy building.</p>`,
}));

mailer.registerTemplate('password-reset', (data) => ({
  subject: 'Password reset request',
  html: `<p>Hi ${data.name},</p><p><a href="${data.link}">Click here to reset your password</a> (valid for 1 hour).</p>`,
}));

module.exports = mailer;
