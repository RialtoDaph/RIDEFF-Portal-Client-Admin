import "server-only";
import { createHash, randomInt } from "node:crypto";

// no 0/O, 1/I/L: easy to read off paper
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Ten one-time codes like "K7QX-M2PD". */
export function makeRecoveryCodes(): string[] {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return Array.from({ length: 10 }, () => `${part()}-${part()}`);
}

/** SHA-256 of the code without dashes or spaces, upper case. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}
