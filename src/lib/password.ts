import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Turn a plain-text password into a one-way hash for storage. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compare a plain-text password attempt against the stored hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}