import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: require('path').resolve(__dirname, '../../.env') });

// Initialize transporter lazily
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;

  if (!smtpUser || !smtpPass || !smtpFrom || !smtpHost) {
    // In development or build, we might not have these.
    // Throwing here might be okay if it's runtime, but let's be safe.
    throw new Error('Missing SMTP_USER, SMTP_PASS, SMTP_FROM, or SMTP_HOST in environment variables');
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for 587
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }) {
  const mailTransporter = getTransporter();
  const smtpFrom = process.env.SMTP_FROM; // Re-get to be safe or store above

  const mailOptions = {
    from: smtpFrom,
    to,
    subject,
    html,
    text,
  };
  return mailTransporter.sendMail(mailOptions);
}
