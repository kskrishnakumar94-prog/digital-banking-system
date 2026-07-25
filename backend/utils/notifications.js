const nodemailer = require('nodemailer');
const logger = require('./logger');

const EMAIL_ALERTS_ENABLED = process.env.EMAIL_ALERTS_ENABLED !== 'false';
const SMS_ALERTS_ENABLED = process.env.SMS_ALERTS_ENABLED === 'true';
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'console'; // 'console' | 'twilio'

let transporter = null;

/**
 * Lazily builds the nodemailer transport. If SMTP isn't configured (no
 * SMTP_HOST), we fall back to logging the email to the console/log file
 * instead of throwing - so the app runs out-of-the-box in dev without a
 * real mail server, but the exact same code path works once SMTP creds
 * are added in .env for production.
 */
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

/**
 * Sends an email alert. Never throws - a notification failure should
 * never break the banking operation that triggered it (e.g. a transfer
 * must still succeed even if the alert email fails to send).
 */
async function sendEmail({ to, subject, html, text }) {
  if (!EMAIL_ALERTS_ENABLED || !to) return { sent: false, reason: 'disabled_or_no_recipient' };

  try {
    const t = getTransporter();
    if (!t) {
      logger.info(`[EMAIL:fallback-console] To: ${to} | Subject: ${subject}\n${text || html}`);
      return { sent: false, reason: 'smtp_not_configured' };
    }

    await t.sendMail({
      from: process.env.SMTP_FROM || `"DigitalBank Alerts" <${process.env.SMTP_USER || 'alerts@digitalbank.local'}>`,
      to,
      subject,
      html,
      text: text || undefined,
    });
    logger.info(`[EMAIL:sent] To: ${to} | Subject: ${subject}`);
    return { sent: true };
  } catch (err) {
    logger.error(`[EMAIL:failed] To: ${to} | ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

/**
 * Sends an SMS alert. Pluggable provider design:
 *  - 'console' (default): logs the message - zero setup, safe for dev/demo.
 *  - 'twilio': sends a real SMS via Twilio. Requires `npm install twilio`
 *    plus TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in .env.
 *    The Twilio SDK is required lazily so the app runs fine without it
 *    installed unless you actually opt into SMS_PROVIDER=twilio.
 */
async function sendSMS({ to, message }) {
  if (!SMS_ALERTS_ENABLED || !to) return { sent: false, reason: 'disabled_or_no_recipient' };

  if (SMS_PROVIDER === 'twilio') {
    try {
      // eslint-disable-next-line global-require
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({ body: message, from: process.env.TWILIO_FROM_NUMBER, to });
      logger.info(`[SMS:twilio:sent] To: ${to}`);
      return { sent: true };
    } catch (err) {
      logger.error(`[SMS:twilio:failed] To: ${to} | ${err.message}`);
      return { sent: false, reason: err.message };
    }
  }

  // Default/dev fallback
  logger.info(`[SMS:fallback-console] To: ${to} | ${message}`);
  return { sent: false, reason: 'console_fallback' };
}

/**
 * Sends the same alert to a user via every channel they have configured
 * (email always if they have one, SMS if enabled + they have a phone).
 */
async function notifyUser(user, { subject, message, html }) {
  const tasks = [];
  if (user?.email) {
    tasks.push(sendEmail({ to: user.email, subject, html: html || `<p>${message}</p>`, text: message }));
  }
  if (user?.phone) {
    tasks.push(sendSMS({ to: user.phone, message: `${subject}: ${message}` }));
  }
  return Promise.all(tasks);
}

module.exports = { sendEmail, sendSMS, notifyUser };
