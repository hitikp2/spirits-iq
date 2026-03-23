import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// Simple AES-256 encryption using NEXTAUTH_SECRET as key
const ALGO = "aes-256-gcm";
function getKey() {
  const secret = process.env.NEXTAUTH_SECRET || "";
  return crypto.scryptSync(secret, "spirits-iq-salt", 32);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(data: string): string {
  const [ivHex, tagHex, encrypted] = data.split(":");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// GET /api/integrations — List store integrations (credentials masked)
export async function GET(request: NextRequest) {
  try {
    const storeId = request.headers.get("x-store-id") || new URL(request.url).searchParams.get("storeId");
    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    const integrations = await db.storeIntegration.findMany({ where: { storeId } });

    // Mask credentials — only return whether they're set, not the actual values
    const masked = integrations.map((i) => ({
      id: i.id,
      provider: i.provider,
      isActive: i.isActive,
      hasCredentials: !!i.credentials,
      config: i.config,
      connectedAt: i.connectedAt,
      connectedBy: i.connectedBy,
    }));

    return NextResponse.json({ success: true, data: masked } satisfies ApiResponse);
  } catch (error) {
    console.error("Integrations GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to load integrations" } satisfies ApiResponse, { status: 500 });
  }
}

// POST /api/integrations — Connect or update an integration
export async function POST(request: NextRequest) {
  try {
    const storeId = request.headers.get("x-store-id") || null;
    const userRole = request.headers.get("x-user-role");
    const userId = request.headers.get("x-user-id");

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    if (userRole !== "OWNER" && userRole !== "MANAGER") {
      return NextResponse.json({ success: false, error: "Only owners and managers can manage integrations" } satisfies ApiResponse, { status: 403 });
    }

    const body = await request.json();
    const { action, provider, credentials, config } = body;

    if (action === "connect") {
      if (!provider) return NextResponse.json({ success: false, error: "provider required" } satisfies ApiResponse, { status: 400 });

      const encryptedCreds = credentials ? encrypt(JSON.stringify(credentials)) : null;

      const integration = await db.storeIntegration.upsert({
        where: { storeId_provider: { storeId, provider } },
        create: {
          storeId,
          provider,
          isActive: true,
          credentials: encryptedCreds,
          config: config || null,
          connectedAt: new Date(),
          connectedBy: userId,
        },
        update: {
          isActive: true,
          credentials: encryptedCreds,
          config: config || undefined,
          connectedAt: new Date(),
          connectedBy: userId,
        },
      });

      return NextResponse.json({
        success: true,
        data: { id: integration.id, provider: integration.provider, isActive: true },
      } satisfies ApiResponse);
    }

    if (action === "disconnect") {
      if (!provider) return NextResponse.json({ success: false, error: "provider required" } satisfies ApiResponse, { status: 400 });

      await db.storeIntegration.updateMany({
        where: { storeId, provider },
        data: { isActive: false, credentials: null },
      });

      return NextResponse.json({ success: true, data: { provider, isActive: false } } satisfies ApiResponse);
    }

    if (action === "test") {
      if (!provider) return NextResponse.json({ success: false, error: "provider required" } satisfies ApiResponse, { status: 400 });

      const integration = await db.storeIntegration.findUnique({
        where: { storeId_provider: { storeId, provider } },
      });

      if (!integration?.credentials) {
        return NextResponse.json({ success: true, data: { status: "no_credentials" } } satisfies ApiResponse);
      }

      try {
        const creds = JSON.parse(decrypt(integration.credentials));
        // Provider-specific connection test
        if (provider === "gemini") {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(creds.apiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
          await model.generateContent("Say hello in one word");
          return NextResponse.json({ success: true, data: { status: "connected" } } satisfies ApiResponse);
        }
        if (provider === "twilio") {
          const twilio = (await import("twilio")).default;
          const client = twilio(creds.accountSid, creds.authToken);
          await client.api.accounts(creds.accountSid).fetch();
          return NextResponse.json({ success: true, data: { status: "connected" } } satisfies ApiResponse);
        }
        return NextResponse.json({ success: true, data: { status: "unknown_provider" } } satisfies ApiResponse);
      } catch {
        return NextResponse.json({ success: true, data: { status: "failed" } } satisfies ApiResponse);
      }
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error) {
    console.error("Integrations POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to update integration" } satisfies ApiResponse, { status: 500 });
  }
}
