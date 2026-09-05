import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthTokenPayload {
  sub: string; // user id
  email: string;
  role: "STUDENT" | "ADMIN";
}

/** Create a signed token proving who this user is, valid for 7 days. */
export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.AUTH_SECRET, { expiresIn: "7d" });
}

/** Verify a token's signature and expiry, and return its payload if valid. */
export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.AUTH_SECRET) as AuthTokenPayload;
}