import nodemailer from "nodemailer";
import { env, isTest } from "../config/env.js";

// Messages "sent" during tests, so tests can read tokens out of them.
export const testOutbox = [];

let transporter;

export const mailConfigured = () => Boolean(env.smtp.host);

export async function sendMail({ to, subject, text }) {
  if (isTest) {
    testOutbox.push({ to, subject, text });
    return;
  }
  if (!mailConfigured()) {
    // Without SMTP, print the email so links (verification, password reset) still work locally.
    console.log(`\n[mail] SMTP not configured - email not sent.\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  await transporter.sendMail({ from: env.smtp.from, to, subject, text });
}
