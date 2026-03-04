import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface NdrUser {
  user_id: string;
  role: string;
  ndr_tenant_id: string;
  email: string;
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
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function generateToken(payload: Omit<NdrUser, "ndr_tenant_id"> & { ndr_tenant_id?: string }): string {
  return jwt.sign(
    { ...payload, ndr_tenant_id: payload.ndr_tenant_id || "default" },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}
