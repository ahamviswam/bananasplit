import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "bananasplit-dev-secret-change-in-prod";
const JWT_EXPIRES = "30d"; // 30 day sessions

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
  isAdmin?: boolean;
}

/** Sign a JWT for a logged-in user */
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/** Verify a JWT and return its payload, or null if invalid */
export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

/** Express middleware — attaches req.user if a valid token is present */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  (req as any).user = payload;
  next();
}

/** Helper to get the authenticated user from a request */
export function getUser(req: Request): AuthPayload {
  return (req as any).user as AuthPayload;
}

/** Middleware — requires isAdmin flag in the JWT */
export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthPayload;
  if (!user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
