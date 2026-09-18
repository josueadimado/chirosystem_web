"use client";

import { InstallAppCallout } from "@/components/install-app-callout";
import { IconBarChart, IconBook, IconCalendar, IconClipboardList, IconFileText, IconMenu, IconStethoscope, IconUsers } from "@/components/icons";
import { NotificationBell } from "@/components/notification-bell";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { StaffSystemUpgradeNotice } from "@/components/staff-system-upgrade-notice";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { PORTAL_ZONE_CLASSES } from "@/lib/portal-readability-classes";
import { isNewNavBadgeActive } from "@/lib/staff-announcements";
import { cn } from "@/lib/utils";

const items: NavItem[] = [
  { label: "My Dashboard", href: "/doctor/dashboard", icon: <IconStethoscope className="w-5 h-5" /> },
  { label: "Analytics", href: "/doctor/analytics", icon: <IconBarChart className="w-5 h-5" /> },
  { label: "My Schedule", href: "/doctor/schedule", icon: <IconCalendar className="w-5 h-5" /> },
  { label: "Patients", href: "/doctor/patients", icon: <IconUsers className="w-5 h-5" /> },
  {
    label: "Intake forms",
    href: "/doctor/intake",
    icon: <IconFileText className="w-5 h-5" />,
    badge: isNewNavBadgeActive("/doctor/intake") ? "new" : undefined,
  },
  { label: "Insurance claims", href: "/doctor/insurance-claims", icon: <IconClipboardList className="w-5 h-5" /> },
  { label: "User guide", href: "/doctor/manual", icon: <IconBook className="w-5 h-5" /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/doctor/dashboard": "My Dashboard",
  "/doctor/analytics": "Analytics",
  "/doctor/schedule": "My Schedule",
  "/doctor/patients": "Patients",
  "/doctor/patients/merge": "Merge patients",
  "/doctor/intake": "Intake forms",
  "/doctor/insurance-claims": "Insurance claims",
  "/doctor/manual": "User guide",
};

export function DoctorLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 1023px)").matches;
  });
  const pathname = usePathname();
  const isUserGuide = pathname === "/doctor/manual";

  /** Same full-height treatment as admin for list/table pages. */
  const isFullBleed =
    pathname === "/doctor/dashboard" ||
    pathname === "/doctor/analytics" ||
    pathname === "/doctor/schedule" ||
    pathname === "/doctor/patients" ||
    pathname === "/doctor/intake" ||
    pathname === "/doctor/insurance-claims";

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar
        title="Relief Chiropractic"
        items={items}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        accent="doctor"
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DoctorHeader sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
        <StaffSystemUpgradeNotice timezoneSource="default" />
        <main
          className={cn(
            "doctor-zone min-h-0 flex-1 overscroll-contain",
            isFullBleed ? "flex flex-col overflow-hidden" : "overflow-y-auto pb-24",
          )}
        >
          <div
            className={cn(
              PORTAL_ZONE_CLASSES,
              isFullBleed
                ? "flex h-full min-h-0 flex-col px-[max(0.75rem,env(safe-area-inset-left))] py-4 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-4 lg:px-5"
                : isUserGuide
                  ? "mx-auto w-full max-w-none px-3 py-6 pb-8 sm:px-4 lg:px-5"
                  : "mx-auto w-full max-w-7xl px-[max(1rem,env(safe-area-inset-left))] py-6 pb-12 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-8",
            )}
          >
            <div
              key={pathname}
              className={cn("content-fade-in", isFullBleed && "flex min-h-0 flex-1 flex-col")}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
      <InstallAppCallout variant="staff" />
    </div>
  );
}

function DoctorHeader({
  sidebarOpen,
  onSidebarToggle,
}: {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const userName = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => localStorage.getItem("chiroflow_user_name"),
    () => null,
  );

  const title =
    pathname === "/doctor/dashboard"
      ? userName
        ? `${userName}'s Dashboard`
        : "My Dashboard"
      : pathname === "/doctor/patients/merge"
        ? "Merge patients"
      : pathname.endsWith("/history")
        ? "Visit history"
      : pathname.startsWith("/doctor/patients/") && pathname !== "/doctor/patients"
        ? "Patient chart"
        : PAGE_TITLES[pathname] ?? "Dashboard";

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chiroflow_access_token");
      localStorage.removeItem("chiroflow_refresh_token");
      localStorage.removeItem("chiroflow_user_name");
      router.push("/auth/sign-in");
    }
  };

  const todayLine = formatWeekdayMonthDayYear(new Date().toISOString().slice(0, 10));

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#e8e8e8] bg-white px-[max(1.5rem,env(safe-area-inset-left))] py-[max(0.875rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] sm:px-8 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onSidebarToggle}
          className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-[#949494] transition-colors hover:bg-[#f5f5f5] hover:text-[#0d5c2e]"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-[#0d1f14]">{title}</h1>
          <p className="hidden text-xs leading-normal text-[#949494] sm:block">{todayLine}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NotificationBell />
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-10 rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-sm font-medium leading-normal text-[#0d1f14] transition-colors hover:bg-[#f5f5f5]"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
