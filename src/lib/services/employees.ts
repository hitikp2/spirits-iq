import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/db/redis";
import bcrypt from "bcryptjs";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── List Employees ──────────────────────────────────────
export async function getEmployees(storeId: string) {
  const users = await db.user.findMany({
    where: { storeId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Get this week's hours and sales per employee
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const enriched = await Promise.all(
    users.map(async (user) => {
      // Get shift hours this week
      const shifts = await db.shift.findMany({
        where: { userId: user.id, date: { gte: weekStart } },
      });
      const weeklyHours = shifts.reduce((s, sh) => {
        if (!sh.clockOut) return s;
        return s + (sh.clockOut.getTime() - sh.clockIn.getTime()) / 3600000;
      }, 0);

      // Get sales this month
      const sales = await db.transaction.aggregate({
        where: { cashierId: user.id, createdAt: { gte: monthStart }, paymentStatus: "COMPLETED" },
        _sum: { total: true },
        _count: true,
      });

      // Check if currently clocked in
      const activeShift = await db.shift.findFirst({
        where: { userId: user.id, clockOut: null },
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        pin: user.pin,
        avatarUrl: user.avatarUrl,
        status: activeShift ? "active" : "off",
        weeklyHours: Math.round(weeklyHours * 10) / 10,
        monthlySales: Number(sales._sum.total || 0),
        monthlyTransactions: sales._count || 0,
        currentShiftStart: activeShift?.clockIn?.toISOString() || null,
        createdAt: user.createdAt.toISOString(),
      };
    })
  );

  return enriched;
}

// ─── Create Employee ─────────────────────────────────────
export async function createEmployee(params: {
  storeId: string;
  name: string;
  email: string;
  password: string;
  role: "MANAGER" | "CASHIER" | "INVENTORY" | "VIEWER";
  pin?: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, 12);
  const pin = params.pin || String(Math.floor(1000 + Math.random() * 9000));

  const user = await db.user.create({
    data: {
      name: params.name,
      email: params.email,
      passwordHash,
      role: params.role,
      pin,
      storeId: params.storeId,
    },
  });

  return { ...user, pin };
}

// ─── Clock In/Out ────────────────────────────────────────
export async function clockIn(userId: string) {
  const existing = await db.shift.findFirst({
    where: { userId, clockOut: null },
  });
  if (existing) throw new Error("Already clocked in");

  return db.shift.create({
    data: {
      userId,
      date: new Date(),
      clockIn: new Date(),
    },
  });
}

export async function clockOut(userId: string) {
  const shift = await db.shift.findFirst({
    where: { userId, clockOut: null },
  });
  if (!shift) throw new Error("Not clocked in");

  const hoursWorked = (Date.now() - shift.clockIn.getTime()) / 3600000;

  return db.shift.update({
    where: { id: shift.id },
    data: {
      clockOut: new Date(),
      hoursWorked: Math.round(hoursWorked * 100) / 100,
    },
  });
}

// ─── Get Schedule ────────────────────────────────────────
export async function getSchedule(storeId: string, weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const schedules = await db.scheduleEntry.findMany({
    where: {
      user: { storeId },
      date: { gte: weekStart, lt: weekEnd },
    },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  // Group by day
  const byDay: Record<string, Array<{ user: string; role: string; start: string; end: string }>> = {};
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    byDay[days[d.getDay()]] = [];
  }

  for (const entry of schedules) {
    const dayName = days[entry.date.getDay()];
    byDay[dayName].push({
      user: entry.user.name,
      role: entry.user.role,
      start: entry.startTime,
      end: entry.endTime,
    });
  }

  return byDay;
}

// ─── AI Schedule Generation ──────────────────────────────
export async function generateAiSchedule(storeId: string, weekStart: Date) {
  const store = await db.store.findUnique({ where: { id: storeId } });
  const employees = await db.user.findMany({
    where: { storeId, role: { in: ["MANAGER", "CASHIER"] } },
  });

  // Get historical traffic patterns
  const recentSnapshots = await db.dailySnapshot.findMany({
    where: { storeId },
    orderBy: { date: "desc" },
    take: 28, // Last 4 weeks
  });

  const avgByDay: Record<string, number> = {};
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const snap of recentSnapshots) {
    const dayName = days[snap.date.getDay()];
    avgByDay[dayName] = (avgByDay[dayName] || 0) + snap.transactions;
  }
  for (const day of days) {
    avgByDay[day] = Math.round((avgByDay[day] || 0) / 4);
  }

  const prompt = `Generate an optimal weekly staff schedule for a liquor store.

STORE HOURS: ${JSON.stringify(store?.operatingHours || {})}

EMPLOYEES:
${employees.map((e) => `- ${e.name} (${e.role}), max 40hrs/week`).join("\n")}

TRAFFIC PATTERNS (avg transactions/day):
${Object.entries(avgByDay).map(([d, t]) => `${d}: ${t} transactions`).join("\n")}

RULES:
- At least 1 person at all times during business hours
- 2+ people during high traffic (Fri, Sat evenings)
- No employee works more than 8 hours in a day
- At least 1 day off per employee per week
- Manager should cover peak hours when possible

Return ONLY valid JSON:
{
  "schedule": [
    { "day": "Mon", "shifts": [{ "employee": "Name", "start": "10:00", "end": "18:00" }] }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  try {
    const parsed = JSON.parse(textBlock?.text?.replace(/```json|```/g, "").trim() || "{}");

    // Save to database
    for (const dayEntry of parsed.schedule || []) {
      const dayIndex = days.indexOf(dayEntry.day);
      if (dayIndex === -1) continue;

      const date = new Date(weekStart);
      date.setDate(date.getDate() + ((dayIndex - weekStart.getDay() + 7) % 7));

      for (const shift of dayEntry.shifts || []) {
        const emp = employees.find((e) => e.name.includes(shift.employee));
        if (!emp) continue;

        await db.scheduleEntry.create({
          data: {
            userId: emp.id,
            date,
            startTime: shift.start,
            endTime: shift.end,
            aiGenerated: true,
          },
        });
      }
    }

    return parsed.schedule;
  } catch {
    return null;
  }
}

// ─── Employee Performance ────────────────────────────────
export async function getEmployeePerformance(storeId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const employees = await db.user.findMany({
    where: { storeId, role: { in: ["MANAGER", "CASHIER"] } },
  });

  const performance = await Promise.all(
    employees.map(async (emp) => {
      const txns = await db.transaction.findMany({
        where: { cashierId: emp.id, createdAt: { gte: since }, paymentStatus: "COMPLETED" },
        include: { items: true },
      });

      const revenue = txns.reduce((s, t) => s + Number(t.total), 0);
      const avgTicket = txns.length > 0 ? revenue / txns.length : 0;
      const totalItems = txns.reduce((s, t) => s + t.items.length, 0);
      const avgItemsPerTxn = txns.length > 0 ? totalItems / txns.length : 0;

      // Upsell rate: transactions with 3+ items
      const upsellTxns = txns.filter((t) => t.items.length >= 3).length;
      const upsellRate = txns.length > 0 ? (upsellTxns / txns.length) * 100 : 0;

      // Hours worked
      const shifts = await db.shift.findMany({
        where: { userId: emp.id, date: { gte: since }, clockOut: { not: null } },
      });
      const totalHours = shifts.reduce((s, sh) => s + (sh.hoursWorked || 0), 0);
      const revenuePerHour = totalHours > 0 ? revenue / totalHours : 0;

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        transactions: txns.length,
        revenue: Math.round(revenue * 100) / 100,
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgItemsPerTxn: Math.round(avgItemsPerTxn * 10) / 10,
        upsellRate: Math.round(upsellRate),
        totalHours: Math.round(totalHours * 10) / 10,
        revenuePerHour: Math.round(revenuePerHour * 100) / 100,
      };
    })
  );

  return performance.sort((a, b) => b.revenue - a.revenue);
}
