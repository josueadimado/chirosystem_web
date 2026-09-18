"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { InstallAppCallout } from "@/components/install-app-callout";
import { StaffSystemUpgradeNotice } from "@/components/staff-system-upgrade-notice";
import {
  IconBarChart,
  IconAlertTriangle,
  IconBook,
  IconBot,
  IconCalendar,
  IconClipboardList,
  IconFileDollar,
  IconFileText,
  IconFilter,
  IconLayoutGrid,
  IconMenu,
  IconSettings,
  IconStethoscope,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import { getRoleCookie } from "@/lib/auth";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { PORTAL_ZONE_CLASSES } from "@/lib/portal-readability-classes";
import { isNewNavBadgeActive } from "@/lib/staff-announcements";
import { cn } from "@/lib/utils";

const mainItems: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: <IconLayoutGrid className="w-5 h-5" /> },
  { label: "Analytics", href: "/admin/analytics", icon: <IconBarChart className="w-5 h-5" /> },
  { label: "Schedule", href: "/admin/schedule", icon: <IconCalendar className="w-5 h-5" /> },
  { label: "Patients", href: "/admin/patients", icon: <IconUsers className="w-5 h-5" /> },
  {
    label: "Intake forms",
    href: "/admin/intake",
    icon: <IconFileText className="w-5 h-5" />,
    badge: isNewNavBadgeActive("/admin/intake") ? "new" : undefined,
  },
];

const operationsItemsBase: NavItem[] = [
  { label: "Invoices & Billing", href: "/admin/billing", icon: <IconFileDollar className="w-5 h-5" /> },
  {
    label: "Payment reconciliation",
    href: "/admin/reconciliation",
    icon: <IconClipboardList className="w-5 h-5" />,
    badge: isNewNavBadgeActive("/admin/reconciliation") ? "new" : undefined,
  },
  { label: "Insurance claims", href: "/admin/insurance-claims", icon: <IconClipboardList className="w-5 h-5" /> },
  { label: "Insurance companies", href: "/admin/insurance-companies", icon: <IconClipboardList className="w-5 h-5" /> },
  { label: "Services & Codes", href: "/admin/services", icon: <IconFileText className="w-5 h-5" /> },
  { label: "Diagnoses & codes", href: "/admin/diagnoses", icon: <IconFileText className="w-5 h-5" /> },
  { label: "Doctors & providers", href: "/admin/providers", icon: <IconStethoscope className="w-5 h-5" /> },
  { label: "Booking blocks", href: "/admin/booking-blocks", icon: <IconFilter className="w-5 h-5" /> },
];

const toolsItemsBase = [
  { label: "User guide", href: "/admin/manual", icon: <IconBook className="w-5 h-5" /> },
  { label: "AI Assistant", href: "/admin/ai", icon: <IconBot className="w-5 h-5" /> },
  { label: "Settings", href: "/admin/settings", icon: <IconSettings className="w-5 h-5" /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Admin Dashboard",
  "/admin/analytics": "Analytics",
  "/admin/schedule": "Schedule",
  "/admin/patients": "Patients",
  "/admin/patients/merge": "Merge patients",
  "/admin/intake": "Intake forms",
  "/admin/billing": "Invoices & Billing",
  "/admin/reconciliation": "Payment reconciliation",
  "/admin/insurance-claims": "Insurance claims",
  "/admin/insurance-companies": "Insurance companies",
  "/admin/services": "Services & Codes",
  "/admin/diagnoses": "Diagnoses & codes",
  "/admin/providers": "Doctors & providers",
  "/admin/team": "Team & logins",
  "/admin/booking-blocks": "Booking blocks",
  "/admin/ai": "AI Assistant",
  "/admin/errors": "Error tracker",
  "/admin/settings": "Settings",
  "/admin/manual": "User guide",
};

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 1023px)").matches;
  });
  const userName = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => localStorage.getItem("chiroflow_user_name"),
    () => null,
  );
  const isOwnerAdmin = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => getRoleCookie() === "owner_admin",
    () => false,
  );
  const pathname = usePathname();
  const router = useRouter();

  const operationsItems = [
    ...operationsItemsBase.slice(0, 5),
    ...(isOwnerAdmin
      ? [{ label: "Team & logins", href: "/admin/team", icon: <IconUserPlus className="w-5 h-5" /> }]
      : []),
    ...operationsItemsBase.slice(5),
  ];

  const toolsItems = [
    ...(isOwnerAdmin
      ? [
          {
            label: "Error tracker",
            href: "/admin/errors",
            icon: <IconAlertTriangle className="w-5 h-5" />,
          },
        ]
      : []),
    ...toolsItemsBase,
  ];

  const sidebarGroups = [
    { label: "", items: mainItems },
    { label: "OPERATIONS", items: operationsItems },
    { label: "TOOLS", items: toolsItems },
  ];

  const title =
    pathname === "/admin/dashboard"
      ? userName
        ? `${userName}'s Dashboard`
        : "Admin Dashboard"
      : PAGE_TITLES[pathname] ?? "Admin Dashboard";

  const isFullBleed =
    pathname === "/admin/dashboard" ||
    pathname === "/admin/analytics" ||
    pathname === "/admin/schedule" ||
    pathname === "/admin/patients" ||
    pathname === "/admin/intake" ||
    pathname === "/admin/billing" ||
    pathname === "/admin/reconciliation" ||
    pathname === "/admin/insurance-claims" ||
    pathname === "/admin/insurance-companies" ||
    pathname === "/admin/services" ||
    pathname === "/admin/team" ||
    pathname === "/admin/diagnoses" ||
    pathname === "/admin/providers" ||
    pathname === "/admin/booking-blocks" ||
    pathname.endsWith("/history");

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chiroflow_access_token");
      localStorage.removeItem("chiroflow_refresh_token");
      localStorage.removeItem("chiroflow_user_name");
      router.push("/auth/sign-in");
    }
  };

  return (
    <>
      <div className="flex h-[100dvh] overflow-hidden">
        <Sidebar
          title="Relief Chiropractic"
          groups={sidebarGroups}
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          accent="admin"
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AdminHeader
            title={title}
            sidebarOpen={sidebarOpen}
            onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
            onLogout={handleLogout}
          />
          <StaffSystemUpgradeNotice timezoneSource="admin" />
          <main
            className={cn(
              "admin-zone min-h-0 flex-1 overscroll-contain",
              isFullBleed ? "flex flex-col overflow-hidden" : "overflow-y-auto",
            )}
          >
            <div
              className={cn(
                PORTAL_ZONE_CLASSES,
                isFullBleed
                  ? "flex h-full min-h-0 flex-col px-[max(0.75rem,env(safe-area-inset-left))] py-4 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-4 lg:px-5"
                  : "mx-auto max-w-7xl px-[max(1rem,env(safe-area-inset-left))] py-6 pb-12 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-8",
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
      </div>
      <InstallAppCallout variant="staff" />
    </>
  );
}

function AdminHeader({
  title,
  sidebarOpen,
  onSidebarToggle,
  onLogout,
}: {
  title: string;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onLogout: () => void;
}) {
  const todayLine = formatWeekdayMonthDayYear(new Date().toISOString().slice(0, 10));

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/90 px-[max(1rem,env(safe-area-inset-left))] py-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] shadow-sm shadow-black/[0.04] backdrop-blur-md sm:px-6 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onSidebarToggle}
          className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-normal tracking-tight text-slate-900">{title}</h1>
          <p className="hidden text-[13px] leading-normal text-slate-500 sm:block">{todayLine}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell />
        <button
          type="button"
          onClick={onLogout}
          className="min-h-11 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium leading-normal text-foreground shadow-sm transition-colors hover:bg-muted/60"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
