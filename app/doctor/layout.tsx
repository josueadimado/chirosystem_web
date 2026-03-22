"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { IconCalendar, IconMenu, IconStethoscope, IconUsers } from "@/components/icons";

const items = [
  { label: "My Dashboard", href: "/doctor/dashboard", icon: <IconStethoscope className="w-5 h-5" /> },
  { label: "My Schedule", href: "/doctor/schedule", icon: <IconCalendar className="w-5 h-5" /> },
  { label: "Patient Directory", href: "/doctor/patients", icon: <IconUsers className="w-5 h-5" /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/doctor/dashboard": "My Dashboard",
  "/doctor/schedule": "My Schedule",
  "/doctor/patients": "Patient Directory",
};

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        title="Relief Chiropractic"
        items={items}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        accent="doctor"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <DoctorHeader sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="doctor-zone flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6 lg:px-8">
            <div key={pathname} className="content-fade-in">
              {children}
            </div>
          </div>
        </main>
      </div>
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
      : PAGE_TITLES[pathname] ?? "Dashboard";

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chiroflow_access_token");
      localStorage.removeItem("chiroflow_refresh_token");
      localStorage.removeItem("chiroflow_user_name");
      router.push("/auth/sign-in");
    }
  };

  const todayLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm shadow-slate-200/40 backdrop-blur-md sm:px-6 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onSidebarToggle}
          className="shrink-0 rounded-xl p-2 text-slate-600 transition-colors hover:bg-emerald-50 hover:text-[#0d5c2e]"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="hidden text-xs text-slate-500 sm:block">{todayLine}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell />
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 sm:px-4"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
