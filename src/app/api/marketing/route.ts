import { NextRequest, NextResponse } from "next/server";
import { getReviewStats, processReviewQueue, getSocialPosts, createSocialPost, getEmailCampaigns, createEmailCampaign, getReferralStats } from "@/lib/services/marketing";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId"); const action = searchParams.get("action") || "reviews";
    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    const h: Record<string, () => Promise<unknown>> = { reviews: () => getReviewStats(storeId), social: () => getSocialPosts(storeId), email: () => getEmailCampaigns(storeId), referrals: () => getReferralStats(storeId) };
    return NextResponse.json({ success: true, data: await (h[action] || h.reviews)() } satisfies ApiResponse);
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try { const body = await request.json();
    if (body.action === "process-reviews") return NextResponse.json({ success: true, data: await processReviewQueue(body.storeId) } satisfies ApiResponse);
    if (body.action === "create-social") return NextResponse.json({ success: true, data: await createSocialPost(body) } satisfies ApiResponse, { status: 201 });
    if (body.action === "create-email") return NextResponse.json({ success: true, data: await createEmailCampaign(body) } satisfies ApiResponse, { status: 201 });
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
