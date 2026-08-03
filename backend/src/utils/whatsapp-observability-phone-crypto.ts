import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

const deriveKey = (secret: string): Buffer =>
  createHash("sha256").update(`wa-obs-phone-v1:${secret}`).digest();

/** Encrypts a phone number for at-rest storage. Format: v1:<iv_b64>:<tag_b64>:<cipher_b64> */
export const encryptPhoneForObservability = (phoneNormalized: string, secret: string): string => {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(phoneNormalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
};

export const decryptPhoneForObservability = (
  ciphertext: string,
  secret: string,
): string | null => {
  if (!ciphertext.startsWith("v1:")) {
    // Legacy plaintext rows written before encryption rollout.
    if (ciphertext.startsWith("+")) {
      return ciphertext;
    }
    return null;
  }

  try {
    const [, ivB64, tagB64, dataB64] = ciphertext.split(":");
    if (!ivB64 || !tagB64 || !dataB64) {
      return null;
    }
    const key = deriveKey(secret);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
};

export const isEncryptedPhoneCiphertext = (value: string): boolean => value.startsWith("v1:");
