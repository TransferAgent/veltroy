import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { execSync } from "child_process";
import path from "path";
import {
  createTenant,
  createUser,
  getUserByEmail,
  getTenantById,
  createVerificationCode,
  verifyCode,
  canResendCode,
  updateUserPassword,
} from "../db/authDb";
import { generateToken, authenticateJWT } from "../middleware/jwtAuth";
import { sendVerificationCode, maskEmail } from "../services/emailVerification";
import { sendWelcomeEmail, sendInviteEmail } from "../services/mailer";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "ndr-platform-jwt-secret-v1.2-lab";

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

function generatePendingToken(email: string): string {
  return jwt.sign(
    { pending: true, email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
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

    // Tenant starter seed removed — My House starts empty by design.
    // Data flows in only when real integrations are connected.
    // Script remains at scripts/seed_tenant_starter_data.py for manual use.

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

    const newUser = getUserByEmail(email);
    const code = await createVerificationCode(String(newUser?.id || 'new'), email);
    await sendVerificationCode(email, code);

    await sendWelcomeEmail(email, tenantId, trialExpiresAt);

    const pendingToken = generatePendingToken(email);

    const hasSes = !!(process.env.AWS_SES_REGION && process.env.AWS_SES_FROM_EMAIL && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    return res.status(201).json({
      tenant_id: tenantId,
      email,
      trial_expires_at: trialExpiresAt,
      requiresMfa: true,
      maskedEmail: maskEmail(email),
      pendingToken,
      ...(!hasSes && { lab_code: code }),
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

    const code = await createVerificationCode(String(user.id), user.email);
    await sendVerificationCode(user.email, code);

    const pendingToken = generatePendingToken(user.email);

    const hasSes = !!(process.env.AWS_SES_REGION && process.env.AWS_SES_FROM_EMAIL && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    return res.status(200).json({
      requiresMfa: true,
      maskedEmail: maskEmail(user.email),
      pendingToken,
      ...(!hasSes && { lab_code: code }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Login failed";
    console.error("[auth/login] Error:", message);
    return res.status(500).json({ error: message });
  }
});

router.post("/auth/verify-otp", async (req: Request, res: Response) => {
  try {
    const { pendingToken, otp_code } = req.body || {};

    if (!pendingToken || !otp_code) {
      return res.status(400).json({ error: "pendingToken and otp_code are required" });
    }

    let pendingPayload: any;
    try {
      pendingPayload = jwt.verify(pendingToken, JWT_SECRET);
      if (!pendingPayload.pending) {
        return res.status(401).json({ error: "Invalid session token" });
      }
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const email = pendingPayload.email;

    const result = await verifyCode(email, otp_code);
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const tenant = getTenantById(user.tenant_id);

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
        org_name: tenant?.name || null,
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

router.post("/auth/resend-otp", async (req: Request, res: Response) => {
  try {
    const { pendingToken } = req.body || {};

    if (!pendingToken) {
      return res.status(400).json({ error: "Missing session token" });
    }

    let pendingPayload: any;
    try {
      pendingPayload = jwt.verify(pendingToken, JWT_SECRET);
      if (!pendingPayload.pending) {
        return res.status(401).json({ error: "Invalid session token" });
      }
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const email = pendingPayload.email;
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!canResendCode(email)) {
      return res.status(429).json({
        error: "Please wait before requesting a new code.",
        retry_after: 60,
      });
    }

    const code = await createVerificationCode(String(user.id), email);
    await sendVerificationCode(email, code);

    const hasSes = !!(process.env.AWS_SES_REGION && process.env.AWS_SES_FROM_EMAIL && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    return res.status(200).json({
      message: "New code sent. Check Replit Logs.",
      maskedEmail: maskEmail(email),
      ...(!hasSes && { lab_code: code }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Resend failed";
    console.error("[auth/resend-otp] Error:", message);
    return res.status(500).json({ error: message });
  }
});

router.post("/auth/change-password", authenticateJWT, async (req: Request, res: Response) => {
  try {
    const jwtUser = req.user as any;
    if (!jwtUser?.email) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "current_password and new_password are required" });
    }

    const user = getUserByEmail(jwtUser.email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordError = validatePassword(new_password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    updateUserPassword(user.id, newHash);

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Password change failed";
    console.error("[auth/change-password] Error:", message);
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
