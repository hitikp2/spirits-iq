import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Append pgbouncer=true to DATABASE_URL for Supabase pooler compatibility
// PgBouncer transaction mode doesn't support prepared statements
function getDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (url.includes("pgbouncer=true")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}pgbouncer=true`;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasourceUrl: getDatasourceUrl(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
