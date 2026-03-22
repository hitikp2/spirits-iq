import { NextRequest, NextResponse } from "next/server";
import { generateShelfTags, renderShelfTagsHTML } from "@/lib/services/labels";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId"); const format = searchParams.get("format") || "json";
    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    const tags = await generateShelfTags(storeId, searchParams.get("productIds")?.split(",").filter(Boolean));
    if (format === "html") { return new NextResponse(renderShelfTagsHTML(tags, { size: (searchParams.get("size") as any) || "medium" }), { headers: { "Content-Type": "text/html" } }); }
    return NextResponse.json({ success: true, data: tags } satisfies ApiResponse);
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
