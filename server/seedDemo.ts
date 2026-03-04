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

const DEMO_EMAIL = "admin@ndr-demo.io";
const DEMO_PASSWORD = "NdrAdmin1!";
const DEMO_TENANT_ID = "ndr-demo-admin";
const DEMO_ORG_NAME = "NDR Demo";

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

  log(`Demo account created: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`, "startup");
}
