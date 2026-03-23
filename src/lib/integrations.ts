import { db } from "@/lib/db";
import crypto from "crypto";

const ALGO = "aes-256-gcm";
function getKey() {
  const secret = process.env.NEXTAUTH_SECRET || "";
  return crypto.scryptSync(secret, "spirits-iq-salt", 32);
}

function decrypt(data: string): string {
  const [ivHex, tagHex, encrypted] = data.split(":");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Cache to avoid repeated DB lookups within a request
const cache = new Map<string, any>();

/**
 * Get credentials for a provider, checking per-store DB first, then env vars.
 * Returns null if neither source has credentials.
 */
export async function getCredentials(
  storeId: string,
  provider: "gemini" | "twilio" | "stripe"
): Promise<Record<string, string> | null> {
  const cacheKey = `${storeId}:${provider}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    // Check per-store DB credentials first
    const integration = await db.storeIntegration.findUnique({
      where: { storeId_provider: { storeId, provider } },
    });

    if (integration?.isActive && integration?.credentials) {
      const creds = JSON.parse(decrypt(integration.credentials));
      cache.set(cacheKey, creds);
      return creds;
    }
  } catch {
    // DB lookup failed — fall through to env vars
  }

  // Fallback to platform env vars
  const envCreds = getEnvCredentials(provider);
  if (envCreds) cache.set(cacheKey, envCreds);
  return envCreds;
}

function getEnvCredentials(provider: string): Record<string, string> | null {
  switch (provider) {
    case "gemini":
      return process.env.GEMINI_API_KEY
        ? { apiKey: process.env.GEMINI_API_KEY }
        : null;
    case "twilio":
      return process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
            messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
          }
        : null;
    case "stripe":
      return process.env.STRIPE_SECRET_KEY
        ? { secretKey: process.env.STRIPE_SECRET_KEY }
        : null;
    default:
      return null;
  }
}
