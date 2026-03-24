import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks", "/api/connect-demo/webhooks", "/connect-demo/storefront"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check auth
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based access for sensitive routes
  const role = token.role as string;
  if (pathname.startsWith("/settings") && !["OWNER", "MANAGER"].includes(role)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Add store context to headers for API routes
  if (pathname.startsWith("/api/")) {
    const headers = new Headers(request.headers);
    headers.set("x-store-id", token.storeId as string);
    headers.set("x-user-id", token.id as string);
    headers.set("x-user-role", role);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
