"use client";

import { UserRole } from "./types";

const ROLE_COOKIE = "chiroflow_role";

export function setRoleCookie(role: UserRole) {
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=${60 * 60 * 24 * 7}`;
}

export function clearRoleCookie() {
  document.cookie = `${ROLE_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Role from the cookie set at sign-in (middleware uses this for /admin vs /doctor). */
export function getRoleCookie(): UserRole | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${ROLE_COOKIE}=([^;]*)`));
  const raw = m?.[1] ? decodeURIComponent(m[1]) : "";
  if (raw === "owner_admin" || raw === "staff" || raw === "doctor" || raw === "patient") {
    return raw;
  }
  return null;
}
