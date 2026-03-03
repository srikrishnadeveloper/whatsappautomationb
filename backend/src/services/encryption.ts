/**
 * Field-Level Message Encryption
 * AES-256-GCM — authenticated encryption for message content at rest.
 *
 * Encryption only activates when ENCRYPTION_SECRET is set in .env.
 * If the env var is missing, content is stored as-is (backwards compatible).
 *
 * Format stored: base64( iv[12] + authTag[16] + ciphertext )
 * Prefix "enc:" distinguishes encrypted values from plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN    = 12;  // 96-bit IV recommended for GCM
const TAG_LEN   = 16;  // 128-bit auth tag
const ENC_PREFIX = 'enc:';

// ── Key derivation ──────────────────────────────────────────────────────────

/** Derive a stable 32-byte key from the environment secret. */
function getKey(): Buffer | null {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) return null; // Encryption disabled when no secret configured
  return createHash('sha256').update(secret).digest();
}

// ── Core encrypt / decrypt ──────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string.
 * Returns a "enc:<base64>" string, or the original if encryption is disabled.
 */
export function encryptContent(plaintext: string): string {
  const key = getKey();
  if (!key || !plaintext || plaintext.startsWith(ENC_PREFIX)) return plaintext;

  try {
    const iv     = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Concatenate iv + authTag + ciphertext → base64
    const packed = Buffer.concat([iv, authTag, encrypted]).toString('base64');
    return ENC_PREFIX + packed;
  } catch (err) {
    console.error('encrypt: failed', err);
    return plaintext; // Fail open — store plaintext rather than crash
  }
}

/**
 * Decrypt a "enc:<base64>" string back to UTF-8.
 * If content is not encrypted (legacy plaintext) it is returned unchanged.
 */
export function decryptContent(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;

  const key = getKey();
  if (!key) return ciphertext; // Key not configured — return as-is

  try {
    const buf  = Buffer.from(ciphertext.slice(ENC_PREFIX.length), 'base64');
    const iv      = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data    = buf.subarray(IV_LEN + TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  } catch {
    // Graceful fallback: return ciphertext if decryption fails
    // (handles corrupted data or key rotation)
    return '[Encrypted — key mismatch]';
  }
}

/** True when ENCRYPTION_SECRET is configured. */
export function isEncryptionEnabled(): boolean {
  return !!process.env.ENCRYPTION_SECRET;
}
