import { NextRequest, NextResponse } from "next/server";

const doctorPaths = ["/doctor"];
const adminPaths = ["/admin"];

function startsWith(paths: string[], pathname: string) {
  return paths.some((path) => pathname.startsWith(path));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Django + DRF expect trailing slashes on router URLs. If the request has no
  // final `/`, Django returns 301; POST+JSON can break on redirect ("Failed to fetch").
  if (
    pathname.startsWith("/api/v1") &&
    !pathname.endsWith("/") &&
    !pathname.slice("/api/v1".length).includes(".")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `${pathname}/`;
    return NextResponse.rewrite(url);
  }

  const role = request.cookies.get("chiroflow_role")?.value;

  if (
    startsWith(adminPaths, pathname) &&
    role !== "owner_admin" &&
    role !== "staff"
  ) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  if (startsWith(doctorPaths, pathname) && role !== "doctor") {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/doctor/:path*", "/api/v1/:path*"],
};
