import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Django + DRF expect trailing slashes on router URLs. If the proxy forwards
 * `/api/v1/auth/login` (no slash), Django returns 301 → clients may retry as GET
 * and drop the POST body, which shows up as "Failed to fetch" on sign-in.
 * Internal rewrite adds the slash before Next rewrites to the API container.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/v1")) return NextResponse.next();
  if (pathname.endsWith("/")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `${pathname}/`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/api/v1/:path*",
};
