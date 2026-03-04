import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_ADDRESS = "NDR Platform <noreply@ndr-platform.io>";

const isLabMode = !SMTP_USER;

function getTransport() {
  if (isLabMode) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendMail(to: string, subject: string, text: string, html: string) {
  if (isLabMode) {
    // LAB_MODE: email logged to console — configure SMTP_USER/SMTP_PASS for live delivery
    console.log(`\n[mailer] LAB_MODE — Email not sent (no SMTP configured)`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text}\n`);
    return { messageId: `lab-${Date.now()}`, labMode: true };
  }

  const transport = getTransport()!;
  const info = await transport.sendMail({ from: FROM_ADDRESS, to, subject, text, html });
  return { messageId: info.messageId, labMode: false };
}

export async function sendOTPEmail(email: string, otp: string, isRegistration: boolean) {
  const subject = "Your NDR Platform verification code";
  const context = isRegistration ? "complete your registration" : "log in";
  const text = [
    `Your verification code is: ${otp}`,
    "",
    `Use this code to ${context}.`,
    "This code expires in 10 minutes.",
    "Do not share this code with anyone.",
    "",
    "— NDR Platform Security",
  ].join("\n");

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">NDR Platform</h2>
      <p>Your verification code is:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 16px; background: #f0f0f0; border-radius: 8px; text-align: center; margin: 16px 0;">${otp}</div>
      <p>Use this code to ${context}. This code expires in <strong>10 minutes</strong>.</p>
      <p style="color: #666; font-size: 12px;">Do not share this code with anyone.</p>
    </div>
  `;

  return sendMail(email, subject, text, html);
}

export async function sendWelcomeEmail(email: string, tenantId: string, trialExpiresAt: string) {
  const subject = "Welcome to NDR Platform — Your network is now protected";
  const dashboardUrl = `https://${process.env.REPL_SLUG || "ndr-platform"}.replit.app/protected`;
  const text = [
    "Welcome to NDR Platform!",
    "",
    `Your trial account (${tenantId}) is now active.`,
    `Trial ends: ${trialExpiresAt}`,
    "",
    "14 threats have been pre-analyzed for your trial account.",
    "",
    `Access your dashboard: ${dashboardUrl}`,
    "",
    "— NDR Platform Team",
  ].join("\n");

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Welcome to NDR Platform</h2>
      <p>Your trial account (<strong>${tenantId}</strong>) is now active.</p>
      <p>Trial ends: <strong>${trialExpiresAt}</strong></p>
      <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
        <strong>14 threats</strong> have been pre-analyzed for your trial account.
      </div>
      <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #1a1a2e; color: white; text-decoration: none; border-radius: 6px;">Open Dashboard</a>
    </div>
  `;

  return sendMail(email, subject, text, html);
}

export async function sendInviteEmail(email: string, orgName: string, tempPassword: string, role: string) {
  const subject = `You've been invited to ${orgName}'s NDR security dashboard`;
  const loginUrl = `https://${process.env.REPL_SLUG || "ndr-platform"}.replit.app/login`;
  const text = [
    `You've been invited to ${orgName}'s NDR security dashboard.`,
    "",
    `Role: ${role}`,
    `Temporary password: ${tempPassword}`,
    "",
    `Log in at: ${loginUrl}`,
    "Please change your password after first login.",
    "",
    "— NDR Platform Team",
  ].join("\n");

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">You've been invited</h2>
      <p>You've been invited to <strong>${orgName}</strong>'s NDR security dashboard.</p>
      <p>Role: <strong>${role}</strong></p>
      <div style="background: #fff3e0; padding: 12px; border-radius: 8px; margin: 16px 0;">
        Temporary password: <code style="font-size: 16px; font-weight: bold;">${tempPassword}</code>
      </div>
      <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: #1a1a2e; color: white; text-decoration: none; border-radius: 6px;">Log In</a>
      <p style="color: #666; font-size: 12px;">Please change your password after first login.</p>
    </div>
  `;

  return sendMail(email, subject, text, html);
}
