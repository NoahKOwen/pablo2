// server/services/email.ts
import nodemailer, { type Transporter, type SendMailOptions } from 'nodemailer';
import {
  generateVerificationEmail,
  generatePasswordResetEmail,
  generateDepositConfirmationEmail,
  generateWithdrawalNotificationEmail,
  generateAchievementUnlockEmail,
  generateWelcomeEmail,
} from '../email/templates';

// ---- Config from ENV ----
const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '95624d002@smtp-brevo.com';
// Support both names, prefer SMTP_PASSWORD if present
const SMTP_PASS = process.env.SMTP_PASSWORD || process.env.SMTP_KEY || '';

const FROM_EMAIL = process.env.FROM_EMAIL || 'XNRT <noreply@xnrt.org>';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

let transporter: Transporter | null = null;

// ---- Transporter setup ----
if (!SMTP_PASS) {
  console.warn(
    '[email] SMTP_PASSWORD/SMTP_KEY not configured, emails will NOT be sent.',
  );
} else {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 587 = false, 465 = true
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendMail(options: SendMailOptions) {
  if (!transporter) {
    console.warn('[email] Skipping send (no transporter):', options.subject);
    return;
  }

  try {
    await transporter.sendMail(options);
  } catch (err) {
    console.error('[email] Failed to send email:', options.subject, err);
    throw err;
  }
}

// ------------------------------------------------------------------
// PUBLIC EMAIL HELPERS
// ------------------------------------------------------------------

export async function sendVerificationEmail(
  email: string,
  username: string,
  token: string,
) {
  const html = generateVerificationEmail(email, token, APP_URL);

  await sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: 'Verify your XNRT email address',
    html,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  username: string,
  token: string,
) {
  // 👇 this matches templates.ts: (email, token, baseUrl)
  const html = generatePasswordResetEmail(email, token, APP_URL);

  await sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: 'Reset your XNRT password',
    html,
  });
}

export async function sendDepositConfirmationEmail(
  email: string,
  amount: number,
  xnrtAmount: number,
  txHash: string,
  confirmations: number,
) {
  const html = generateDepositConfirmationEmail(
    email,
    amount,
    xnrtAmount,
    txHash,
    confirmations,
  );

  await sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: 'Your XNRT deposit is confirmed',
    html,
  });
}

export async function sendWithdrawalNotificationEmail(
  email: string,
  amount: number,
  usdtAmount: number,
  status: 'pending' | 'approved' | 'rejected',
  walletAddress?: string,
) {
  const html = generateWithdrawalNotificationEmail(
    email,
    amount,
    usdtAmount,
    status,
    walletAddress,
  );

  await sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: `Withdrawal ${status === 'approved'
      ? 'approved'
      : status === 'rejected'
      ? 'rejected'
      : 'pending'}`,
    html,
  });
}

export async function sendAchievementUnlockEmail(
  email: string,
  achievementName: string,
  achievementDescription: string,
  xpReward: number,
) {
  const html = generateAchievementUnlockEmail(
    email,
    achievementName,
    achievementDescription,
    xpReward,
  );

  await sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: `Achievement unlocked: ${achievementName}`,
    html,
  });
}

export async function sendWelcomeEmail(email: string, username: string) {
  const html = generateWelcomeEmail(email, username, APP_URL);

  await sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: 'Welcome to XNRT 🚀',
    html,
  });
}
