import nodemailer from 'nodemailer';
import { SMTP, MAIL_FROM } from './config.js';

const transporter = SMTP.host
  ? nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.port === 465,
    auth: SMTP.user ? { user: SMTP.user, pass: SMTP.pass } : undefined,
  })
  : null;

export const mailConfigured = !!transporter;

/** Sends an email. Never call inside a DB transaction (NFR-1). Returns true when delivered to SMTP. */
export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    console.log(`\n--- EMAIL (SMTP not configured, not sent) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n--------------------------------------------\n`);
    return true;
  }
  try {
    await transporter.sendMail({ from: MAIL_FROM, to, subject, text, html });
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function verificationEmail({ name, code, link }) {
  return {
    subject: `${code} is your Shuka verification code`,
    text: `Hello ${name},\n\nYour Shuka verification code is: ${code}\n\nOr open this link to confirm your email:\n${link}\n\nThe code expires in 15 minutes. If you did not create a Shuka account, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#111827">
      <h2 style="color:#e8743b;margin-bottom:4px">shuka.am</h2>
      <p>Hello ${esc(name)},</p>
      <p>Your verification code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f3f4f6;padding:12px 16px;border-radius:8px;text-align:center">${code}</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#e8743b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Confirm my email</a></p>
      <p style="color:#6b7280;font-size:13px">The code expires in 15 minutes. If you did not create a Shuka account, ignore this email.</p>
    </div>`,
  };
}
