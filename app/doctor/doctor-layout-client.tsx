"use client";

import { InstallAppCallout } from "@/components/install-app-callout";
import { IconBook, IconCalendar, IconMenu, IconStethoscope, IconUsers } from "@/components/icons";
import { NotificationBell } from "@/components/notification-bell";
import { Sidebar } from "@/components/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { PORTAL_ZONE_CLASSES } from "@/lib/portal-readability-classes";
import { cn } from "@/lib/utils";

const items = [
  { label: "My Dashboard", href: "/doctor/dashboard", icon: <IconStethoscope className="w-5 h-5" /> },
  { label: "My Schedule", href: "/doctor/schedule", icon: <IconCalendar className="w-5 h-5" /> },
  { label: "Patients", href: "/doctor/patients", icon: <IconUsers className="w-5 h-5" /> },
  { label: "User guide", href: "/doctor/manual", icon: <IconBook className="w-5 h-5" /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/doctor/dashboard": "My Dashboard",
  "/doctor/schedule": "My Schedule",
  "/doctor/patients": "Patients",
  "/doctor/manual": "User guide",
};

export function DoctorLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

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
        <main className="doctor-zone min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24">
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
  const [userName, setUserName] = useState<string | null>(null);

  // Read userName after mount to avoid hydration mismatch (localStorage not available on server)
  useEffect(() => {
    setUserName(localStorage.getItem("chiroflow_user_name"));
  }, []);

  const title =
    pathname === "/doctor/dashboard"
      ? userName
        ? `${userName}'s Dashboard`
        : "My Dashboard"
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
          <h1 className="truncate text-lg font-semibold leading-normal tracking-tight text-foreground">{title}</h1>
          <p className="hidden text-[13px] leading-normal text-muted-foreground sm:block">{todayLine}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell />
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-11 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium leading-normal text-foreground shadow-sm transition-colors hover:bg-muted/60"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
