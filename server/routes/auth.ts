import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { execSync } from "child_process";
import path from "path";
import {
  createTenant,
  createUser,
  getUserByEmail,
  getTenantById,
  createOtp,
  getLatestUnusedOtp,
  markOtpUsed,
} from "../db/authDb";
import { generateToken, authenticateJWT } from "../middleware/jwtAuth";
import { sendOTPEmail, sendWelcomeEmail, sendInviteEmail } from "../services/mailer";

const router = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function nanoid(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/\d/.test(password)) return "Password must contain at least 1 number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return "Password must contain at least 1 special character";
  return null;
}

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { email, password, org_name, tier } = req.body || {};

    if (!email || !password || !org_name) {
      return res.status(400).json({ error: "email, password, and org_name are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const tenantId = `${slugify(org_name)}-${nanoid(6)}`;
    const trialExpiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

    createTenant({
      tenant_id: tenantId,
      name: org_name,
      tier: tier || "trial",
      is_trial: 1,
      trial_expires_at: trialExpiresAt,
    });

    createUser({
      tenant_id: tenantId,
      email,
      password_hash: passwordHash,
      role: "owner",
      is_parent: 1,
    });

    try {
      const seedScript = path.join(process.cwd(), "scripts", "seed_trial_data.py");
      const output = execSync(`python3 "${seedScript}" --tenant_id="${tenantId}"`, {
        timeout: 30000,
        encoding: "utf-8",
      });
      console.log(`[auth/register] Seed output:\n${output}`);
    } catch (seedErr) {
      console.error(`[auth/register] Seed script error (non-fatal):`, seedErr);
    }

    const SKIP_2FA = process.env.SKIP_2FA === 'true';

    if (SKIP_2FA) {
      const newUser = getUserByEmail(email);
      const token = generateToken({
        user_id:          String(newUser?.id || 'new'),
        email,
        role:             'owner',
        ndr_tenant_id:    tenantId,
        is_parent:        true,
        is_trial:         true,
        trial_expires_at: trialExpiresAt,
        blueprint_version: 'v1.2',
      });
      return res.status(201).json({
        tenant_id: tenantId,
        email,
        trial_expires_at: trialExpiresAt,
        auto_login: true,
        token,
        user: {
          email,
          role: 'owner',
          tenant_id: tenantId,
          is_trial: true,
          is_parent: true,
        },
      });
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    createOtp(email, otp, otpExpiresAt);

    await sendOTPEmail(email, otp, true);
    await sendWelcomeEmail(email, tenantId, trialExpiresAt);

    return res.status(201).json({
      tenant_id: tenantId,
      email,
      trial_expires_at: trialExpiresAt,
      message: "Check your email to verify your account.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    console.error("[auth/register] Error:", message);
    return res.status(500).json({ error: message });
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tenant = getTenantById(user.tenant_id);
    if (tenant && tenant.is_trial && tenant.trial_expires_at) {
      const expiry = new Date(tenant.trial_expires_at).getTime();
      if (expiry < Date.now()) {
        return res.status(402).json({
          message: "Trial expired. Upgrade to continue.",
          upgrade_url: "/upgrade",
        });
      }
    }

    if (user.status !== "active") {
      return res.status(401).json({ error: "Account is not active" });
    }

    const SKIP_2FA = process.env.SKIP_2FA === 'true';

    if (SKIP_2FA) {
      const token = generateToken({
        user_id:          String(user.id),
        email:            user.email,
        role:             user.role,
        ndr_tenant_id:    user.tenant_id,
        is_parent:        user.is_parent === 1,
        is_trial:         tenant?.is_trial === 1,
        trial_expires_at: tenant?.trial_expires_at || undefined,
        blueprint_version: 'v1.2',
      });
      return res.status(200).json({
        token,
        user: {
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
          is_trial: tenant?.is_trial === 1,
          is_parent: user.is_parent === 1,
        },
      });
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    createOtp(email, otp, otpExpiresAt);

    await sendOTPEmail(email, otp, false);

    return res.status(200).json({
      message: "OTP sent to your email.",
      email,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Login failed";
    console.error("[auth/login] Error:", message);
    return res.status(500).json({ error: message });
  }
});

router.post("/auth/verify-otp", (req: Request, res: Response) => {
  try {
    const { email, otp_code } = req.body || {};

    if (!email || !otp_code) {
      return res.status(400).json({ error: "email and otp_code are required" });
    }

    const otpRecord = getLatestUnusedOtp(email);
    if (!otpRecord) {
      return res.status(401).json({ error: "No valid OTP found" });
    }

    const expiry = new Date(otpRecord.expires_at).getTime();
    if (expiry < Date.now()) {
      return res.status(401).json({ error: "OTP has expired" });
    }

    if (otpRecord.otp_code !== otp_code) {
      return res.status(401).json({ error: "Invalid OTP code" });
    }

    markOtpUsed(otpRecord.id);

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const tenant = getTenantById(user.tenant_id);

    const token = generateToken({
      user_id: String(user.id),
      email: user.email,
      role: user.role,
      ndr_tenant_id: user.tenant_id,
      is_parent: user.is_parent === 1,
      is_trial: tenant?.is_trial === 1,
      trial_expires_at: tenant?.trial_expires_at || undefined,
      blueprint_version: 'v1.2',
    });

    return res.status(200).json({
      token,
      user: {
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        is_trial: tenant?.is_trial === 1,
        is_parent: user.is_parent === 1,
        trial_expires_at: tenant?.trial_expires_at,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OTP verification failed";
    console.error("[auth/verify-otp] Error:", message);
    return res.status(500).json({ error: message });
  }
});

router.post("/auth/invite", authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user || !(user as any).is_parent) {
      return res.status(403).json({ error: "Only parent accounts can send invites" });
    }

    const { email, role } = req.body || {};

    if (!email || !role) {
      return res.status(400).json({ error: "email and role are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const forbiddenRoles = ["owner", "super_admin"];
    if (forbiddenRoles.includes(role)) {
      return res.status(400).json({ error: "Cannot grant owner or super_admin roles via invite" });
    }

    const allowedRoles = ["support", "customer", "billing_admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const tempPassword = nanoid(12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    createUser({
      tenant_id: user.ndr_tenant_id,
      email,
      password_hash: passwordHash,
      role,
      is_parent: 0,
    });

    const tenant = getTenantById(user.ndr_tenant_id);
    const orgName = tenant?.name || user.ndr_tenant_id;

    await sendInviteEmail(email, orgName, tempPassword, role);

    return res.status(201).json({
      email,
      role,
      tenant_id: user.ndr_tenant_id,
      message: "Invite sent.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invite failed";
    console.error("[auth/invite] Error:", message);
    return res.status(500).json({ error: message });
  }
});

export default router;
