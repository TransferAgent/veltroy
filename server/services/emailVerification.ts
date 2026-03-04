import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `****${local.slice(-2)}@${domain}`;
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  console.log(`\n========================================`);
  console.log(`[NDR 2FA] Verification code for ${email}: ${code}`);
  console.log(`========================================\n`);

  const sesRegion = process.env.AWS_SES_REGION;
  const fromEmail = process.env.AWS_SES_FROM_EMAIL;
  const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (sesRegion && fromEmail && hasAwsCreds) {
    (async () => {
      try {
        const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
        const ses = new SESClient({ region: sesRegion });
        await ses.send(new SendEmailCommand({
          Source: fromEmail,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: 'NDR Platform — Verify Your Login', Charset: 'UTF-8' },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: `
                  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0f1a;color:#E2E8F0;">
                    <h2 style="color:#63B3ED;">🛡️ NDR Platform</h2>
                    <p>Your login verification code is:</p>
                    <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;
                                padding:20px;background:#0d1b2a;border:1px solid #63B3ED;
                                border-radius:8px;margin:16px 0;color:#63B3ED;">
                      ${code}
                    </div>
                    <p style="color:#718096;font-size:14px;">
                      Expires in 10 minutes. Do not share this code.
                    </p>
                  </div>`
              },
              Text: {
                Charset: 'UTF-8',
                Data: `Your NDR Platform verification code is: ${code}\n\nExpires in 10 minutes.`
              }
            }
          }
        }));
        console.log(`[NDR 2FA] Code delivered to ${email} via AWS SES`);
      } catch (err) {
        console.error(`[NDR 2FA] SES send failed (code was logged above):`, err);
      }
    })();
  }
}
