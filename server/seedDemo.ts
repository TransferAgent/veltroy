import bcrypt from "bcryptjs";
import { execSync } from "child_process";
import path from "path";
import {
  getUserByEmail,
  createTenant,
  createUser,
  getTenantById,
} from "./db/authDb";
import { log } from "./index";

const DEMO_EMAIL = process.env.DEMO_ADMIN_EMAIL || "admin@ndr-demo.io";
const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "NdrAdmin1!";
const DEMO_TENANT_ID = "ndr-demo-admin";
const DEMO_ORG_NAME = "NDR Demo";

const SUPER_EMAIL = process.env.SUPER_USER_EMAIL || "super@ndr-platform.io";
const SUPER_PASSWORD = process.env.SUPER_USER_PASSWORD || "SuperNdr1!";
const SUPER_TENANT_ID = "ndr-platform-core";
const SUPER_ORG_NAME = "NDR Platform";

export async function seedSuperUser(): Promise<void> {
  const existing = getUserByEmail(SUPER_EMAIL);
  if (existing) {
    log("Super user already exists — skipping seed", "startup");
    return;
  }

  const existingTenant = getTenantById(SUPER_TENANT_ID);
  if (!existingTenant) {
    createTenant({
      tenant_id: SUPER_TENANT_ID,
      name: SUPER_ORG_NAME,
      tier: "enterprise",
      is_trial: 0,
      trial_expires_at: "",
    });
  }

  const passwordHash = await bcrypt.hash(SUPER_PASSWORD, 12);
  createUser({
    tenant_id: SUPER_TENANT_ID,
    email: SUPER_EMAIL,
    password_hash: passwordHash,
    role: "super_admin",
    is_parent: 1,
  });

  log(`Super user created: ${SUPER_EMAIL}`, "startup");
}

export async function seedDemoAccount(): Promise<void> {
  const existing = getUserByEmail(DEMO_EMAIL);
  if (existing) {
    log("Demo account already exists — skipping seed", "startup");
    return;
  }

  const existingTenant = getTenantById(DEMO_TENANT_ID);
  if (!existingTenant) {
    const trialExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    createTenant({
      tenant_id: DEMO_TENANT_ID,
      name: DEMO_ORG_NAME,
      tier: "trial",
      is_trial: 1,
      trial_expires_at: trialExpiresAt,
    });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  createUser({
    tenant_id: DEMO_TENANT_ID,
    email: DEMO_EMAIL,
    password_hash: passwordHash,
    role: "owner",
    is_parent: 1,
  });

  try {
    const seedScript = path.join(process.cwd(), "scripts", "seed_trial_data.py");
    execSync(`python3 "${seedScript}" --tenant_id="${DEMO_TENANT_ID}"`, {
      timeout: 30000,
      encoding: "utf-8",
    });
    log("Demo account seeded with trial data", "startup");
  } catch (seedErr) {
    log(`Demo seed data warning: ${seedErr instanceof Error ? seedErr.message : seedErr}`, "startup");
  }

  log(`Demo account created: ${DEMO_EMAIL}`, "startup");
}
