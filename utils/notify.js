const nodemailer = require("nodemailer");
const Notification = require("../models/Notification");
const { getSettings } = require("./settings");

// Built once and reused - nodemailer pools/keeps the SMTP connection warm.
// If SMTP env vars are missing, every send is skipped (logged, not fatal) so
// the rest of the app keeps working without email configured.
let transporter = null;
const getTransporter = () => {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: Number(SMTP_PORT) !== 587, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
};

// Creates the in-app notification (always) and, for cancellations, emails
// the address saved in Settings > Notifications (if SMTP + that address are
// both configured). Never throws - a notification failure must not break
// the booking action that triggered it.
const notify = async ({ type, title, message, link = "", email = null }) => {
  let doc = null;
  try {
    doc = await Notification.create({ type, title, message, link });
  } catch (error) {
    console.error("notify: could not save notification:", error.message);
  }

  if (!email) return;
  try {
    const settings = await getSettings();
    const to = settings.notifyEmail;
    if (!to) return;
    const mailer = getTransporter();
    if (!mailer) return; // SMTP not configured yet

    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: email.subject,
      text: email.text,
    });
    if (doc) await Notification.updateOne({ _id: doc._id }, { $set: { emailSent: true } });
  } catch (error) {
    console.error("notify: email send failed:", error.message);
  }
};

module.exports = { notify };
