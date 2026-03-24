import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/customers — List and search customers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const search = searchParams.get("search");
    const tier = searchParams.get("tier");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { storeId };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (tier) where.tier = tier;

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where: where as any,
        orderBy: { lastVisit: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { transactions: true, smsMessages: true } },
        },
      }),
      db.customer.count({ where: where as any }),
    ]);

    return NextResponse.json({
      success: true,
      data: customers,
      meta: { page, limit, total, hasMore: page * limit < total },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("Customers GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customers" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/customers — Create or update a customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { storeId, phone, email, firstName, lastName, tier, tags } = body;

      const existing = await db.customer.findFirst({
        where: { storeId, phone },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, error: "Customer with this phone already exists" } satisfies ApiResponse,
          { status: 409 }
        );
      }

      const customer = await db.customer.create({
        data: {
          storeId,
          phone,
          email,
          firstName,
          lastName,
          tier: tier || "REGULAR",
          tags: tags || [],
          smsOptedIn: true,
          smsOptInDate: new Date(),
        },
      });

      return NextResponse.json(
        { success: true, data: customer } satisfies ApiResponse,
        { status: 201 }
      );
    }

    if (action === "update") {
      const { id, ...updates } = body;
      delete updates.action;

      const customer = await db.customer.update({
        where: { id },
        data: updates,
      });

      return NextResponse.json({ success: true, data: customer } satisfies ApiResponse);
    }

    if (action === "lookup") {
      // Quick lookup by phone — used at POS for loyalty
      const { storeId, phone } = body;
      const customer = await db.customer.findFirst({
        where: {
          storeId,
          phone: { endsWith: phone.replace(/\D/g, "").slice(-10) },
        },
        include: {
          transactions: {
            take: 5,
            orderBy: { createdAt: "desc" },
            select: { total: true, createdAt: true, transactionNum: true },
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: customer,
      } satisfies ApiResponse);
    }

    if (action === "detail") {
      const { id } = body;
      if (!id) {
        return NextResponse.json(
          { success: false, error: "Customer id is required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const customer = await db.customer.findUnique({
        where: { id },
        include: {
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              items: {
                include: { product: { select: { name: true, size: true } } },
              },
            },
          },
          loyaltyTxns: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      if (!customer) {
        return NextResponse.json(
          { success: false, error: "Customer not found" } satisfies ApiResponse,
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: customer,
      } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error) {
    console.error("Customers POST error:", error);
    return NextResponse.json(
      { success: false, error: "Operation failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
