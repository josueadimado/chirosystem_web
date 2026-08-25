"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { InstallAppCallout } from "@/components/install-app-callout";
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
import { cn } from "@/lib/utils";

const mainItems = [
  { label: "Dashboard", href: "/admin/dashboard", icon: <IconLayoutGrid className="w-5 h-5" /> },
  { label: "Analytics", href: "/admin/analytics", icon: <IconBarChart className="w-5 h-5" /> },
  { label: "Schedule", href: "/admin/schedule", icon: <IconCalendar className="w-5 h-5" /> },
  { label: "Patients", href: "/admin/patients", icon: <IconUsers className="w-5 h-5" /> },
  { label: "Intake forms", href: "/admin/intake", icon: <IconFileText className="w-5 h-5" /> },
];

const operationsItemsBase = [
  { label: "Invoices & Billing", href: "/admin/billing", icon: <IconFileDollar className="w-5 h-5" /> },
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
  "/admin/intake": "Intake forms",
  "/admin/billing": "Invoices & Billing",
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Read userName after mount to avoid hydration mismatch (localStorage not available on server)
  useEffect(() => {
    setUserName(localStorage.getItem("chiroflow_user_name"));
    setIsOwnerAdmin(getRoleCookie() === "owner_admin");
    // Narrow screens: start with menu closed so content uses full width (open with the menu button)
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

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
          <main className="admin-zone min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className={cn(
                "mx-auto max-w-7xl px-[max(1rem,env(safe-area-inset-left))] py-6 pb-12 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-8",
                PORTAL_ZONE_CLASSES,
              )}
            >
              <div key={pathname} className="content-fade-in">
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
