import { NextRequest, NextResponse } from "next/server";

const doctorPaths = ["/doctor"];
const adminPaths = ["/admin"];

function startsWith(paths: string[], pathname: string) {
  return paths.some((path) => pathname.startsWith(path));
}

export function proxy(request: NextRequest) {
  const role = request.cookies.get("chiroflow_role")?.value;
  const pathname = request.nextUrl.pathname;

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
  matcher: ["/admin/:path*", "/doctor/:path*"],
};
