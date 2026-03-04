import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface NdrUser {
  user_id: string;
  role: string;
  ndr_tenant_id: string;
  email: string;
  is_parent?: boolean;
  is_trial?: boolean;
  trial_expires_at?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: NdrUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "ndr-platform-jwt-secret-v1.2-lab";

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    const ndr_tenant_id = (decoded.ndr_tenant_id as string) || "default";
    if (!decoded.ndr_tenant_id) {
      console.warn(`[jwtAuth] Token for user ${decoded.user_id} missing ndr_tenant_id — defaulting to "default"`);
    }

    req.user = {
      user_id: decoded.user_id as string,
      role: decoded.role as string,
      ndr_tenant_id,
      email: decoded.email as string,
      is_parent: decoded.is_parent as boolean | undefined,
      is_trial: decoded.is_trial as boolean | undefined,
      trial_expires_at: decoded.trial_expires_at as string | undefined,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function generateToken(payload: Omit<NdrUser, "ndr_tenant_id"> & { ndr_tenant_id?: string }): string {
  return jwt.sign(
    {
      ...payload,
      ndr_tenant_id: payload.ndr_tenant_id || "default",
      blueprint_version: "v1.2",
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

export function isTrialExpired(req: Request, res: Response, next: NextFunction) {
  if (req.user?.is_trial && req.user?.trial_expires_at) {
    const expiry = new Date(req.user.trial_expires_at).getTime();
    if (expiry < Date.now()) {
      return res.status(402).json({
        error: "Trial expired. Upgrade to continue.",
        upgrade_url: "/upgrade",
      });
    }
  }
  next();
}
