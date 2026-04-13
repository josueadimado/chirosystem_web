"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { IconLogo } from "./icons";

export type NavItem = { label: string; href: string; icon?: React.ReactNode };

export type NavGroup = { label: string; items: NavItem[] };

type SidebarProps = {
  title: string;
  items?: NavItem[];
  groups?: NavGroup[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Doctor & admin: Relief green chrome · Default: neutral slate */
  accent?: "default" | "doctor" | "admin";
};

function navActiveClasses(accent: "default" | "doctor" | "admin", active: boolean): string {
  if (!active) return "text-muted-foreground hover:bg-muted/80";
  if (accent === "admin" || accent === "doctor")
    return "bg-primary/12 text-teal-800 shadow-sm shadow-primary/10";
  return "bg-muted text-foreground";
}

function navIconClass(accent: "default" | "doctor" | "admin", active: boolean): string {
  if (!active) return "text-muted-foreground";
  if (accent === "admin" || accent === "doctor") return "text-primary";
  return "text-foreground";
}

function NavLink({
  item,
  pathname,
  open,
  accent,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  open: boolean;
  accent: "default" | "doctor" | "admin";
  onNavigate?: () => void;
}) {
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      title={!open ? item.label : undefined}
      onClick={() => onNavigate?.()}
      className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
        open ? "gap-3 px-3" : "justify-center px-0"
      } ${navActiveClasses(accent, active)}`}
    >
      {item.icon != null && (
        <span className={`shrink-0 ${navIconClass(accent, active)}`}>{item.icon}</span>
      )}
      {open && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar({
  title,
  items = [],
  groups,
  open: controlledOpen,
  onOpenChange,
  accent = "default",
}: SidebarProps) {
  const pathname = usePathname();
  const [internalOpen, setInternalOpen] = useState(true);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const useGroups = groups != null && groups.length > 0;

  /** Phone / small tablet: close drawer after choosing a page */
  const closeMobileDrawer = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open) return;
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const syncBodyScroll = () => {
      if (mq.matches && open) document.body.style.overflow = "hidden";
      else document.body.style.overflow = "";
    };
    syncBodyScroll();
    mq.addEventListener("change", syncBodyScroll);
    return () => {
      mq.removeEventListener("change", syncBodyScroll);
      document.body.style.overflow = "";
    };
  }, [open]);

  const chrome =
    accent === "doctor" || accent === "admin"
      ? "border-primary/10 bg-gradient-to-b from-sidebar via-sidebar to-primary/[0.06]"
      : "border-border bg-sidebar";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "flex h-[100dvh] max-h-[100dvh] shrink-0 flex-col border-r transition-[transform,width] duration-200 ease-out",
          chrome,
          "fixed left-0 top-0 z-50 w-72 max-w-[85vw] md:relative md:top-auto md:z-auto md:max-h-none md:max-w-none",
          open ? "max-md:translate-x-0 max-md:shadow-xl" : "max-md:-translate-x-full",
          "md:translate-x-0",
          open ? "md:w-72" : "md:w-20",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-4",
            open ? "" : "justify-center px-0",
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconLogo className="h-6 w-6" />
          </div>
          {open && (
            <p className="min-w-0 text-xl font-extrabold leading-tight text-[#e9982f] truncate">
              {title}
            </p>
          )}
        </div>
        <nav
          className={cn(
            "flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4",
            open ? "" : "px-2",
          )}
        >
          {useGroups ? (
            groups.map((group) => (
              <div key={group.label || "main"} className="space-y-1">
                {open && group.label ? (
                  <p className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    open={open}
                    accent={accent}
                    onNavigate={closeMobileDrawer}
                  />
                ))}
              </div>
            ))
          ) : (
            items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                open={open}
                accent={accent}
                onNavigate={closeMobileDrawer}
              />
            ))
          )}
        </nav>
      </aside>
    </>
  );
}

