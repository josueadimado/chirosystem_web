"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

export type NavItem = {
  label: string;
  href: string;
  icon?: React.ReactNode;
  /** Small pill next to the label (e.g. newly shipped pages). */
  badge?: "new";
};

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
  // Banani doctor + admin: dark green sidebar, green active pill
  if (accent === "admin" || accent === "doctor") {
    return active
      ? "bg-[#16a349] text-white shadow-sm shadow-black/20"
      : "text-white/70 hover:bg-white/10 hover:text-white";
  }
  if (!active) return "text-muted-foreground hover:bg-muted/80";
  return "bg-muted text-foreground";
}

function navIconClass(accent: "default" | "doctor" | "admin", active: boolean): string {
  if (accent === "admin" || accent === "doctor") return active ? "text-white" : "text-white/70";
  if (!active) return "text-muted-foreground";
  return "text-foreground";
}

/** Highlight parent nav when viewing nested routes (e.g. patient chart under Patients). */
function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href.length > 1 && pathname.startsWith(`${href}/`);
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
  const active = isNavItemActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      title={!open ? item.label : undefined}
      onClick={() => onNavigate?.()}
      className={cn(
        "flex min-h-11 items-center rounded-lg text-[14px] font-medium leading-normal transition-colors",
        open ? "gap-3 px-3" : "justify-center px-0",
        navActiveClasses(accent, active),
      )}
    >
      {item.icon != null && (
        <span className={`relative shrink-0 ${navIconClass(accent, active)}`}>
          {item.icon}
          {!open && item.badge === "new" ? (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400",
                accent === "admin" || accent === "doctor"
                  ? "ring-2 ring-[#0d5c2e]"
                  : "ring-2 ring-sidebar",
              )}
              aria-hidden
            />
          ) : null}
        </span>
      )}
      {open && (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{item.label}</span>
          {item.badge === "new" ? (
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white",
                accent === "admin" || accent === "doctor" ? "bg-[#e9982f]" : "bg-emerald-600",
              )}
            >
              New
            </span>
          ) : null}
        </span>
      )}
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

  /** Phone / tablet: close drawer after choosing a page */
  const closeMobileDrawer = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setOpen(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open) return;
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
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
    accent === "admin" || accent === "doctor"
      ? "border-[#0a4a25] bg-[#0d5c2e] text-white"
      : "border-border bg-sidebar";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "flex h-[100dvh] max-h-[100dvh] shrink-0 flex-col border-r transition-[transform,width] duration-200 ease-out",
          chrome,
          "fixed left-0 top-0 z-50 w-72 max-w-[85vw] lg:relative lg:top-auto lg:z-auto lg:max-h-none lg:max-w-none",
          open ? "max-lg:translate-x-0 max-lg:shadow-xl" : "max-lg:-translate-x-full",
          "lg:translate-x-0",
          open ? "lg:w-72" : "lg:w-20",
        )}
      >
        <div
          role="banner"
          aria-label={title}
          className={cn(
            "flex items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4",
            open ? "" : "justify-center px-0",
            (accent === "admin" || accent === "doctor") && open && "px-4 pb-5",
          )}
        >
          {accent === "admin" || accent === "doctor" ? (
            open ? (
              <div className="w-full overflow-hidden rounded-xl bg-white p-2.5 shadow-sm shadow-black/15">
                <BrandLogo variant="full" className="!max-h-10 w-full !max-w-full object-contain object-left" priority />
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg bg-white p-1.5 shadow-sm shadow-black/15">
                <BrandLogo variant="mark" className="!h-8 !w-8 shrink-0 rounded-md object-contain" priority />
              </div>
            )
          ) : open ? (
            <BrandLogo variant="full" className="min-h-10 min-w-0 max-h-11" priority />
          ) : (
            <BrandLogo variant="mark" className="shrink-0 rounded-lg ring-1 ring-primary/10" priority />
          )}
        </div>
        <nav
          className={cn(
            "flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4",
            open ? "" : "px-2",
          )}
        >
          {useGroups ? (
            groups.map((group) => (
              <div key={group.label || "main"} className="space-y-1">
                {open && group.label ? (
                  <p
                    className={cn(
                      "mt-4 mb-1 px-3 text-[13px] font-semibold uppercase tracking-wider first:mt-0 leading-normal",
                      accent === "admin" || accent === "doctor" ? "text-white/50" : "text-muted-foreground",
                    )}
                  >
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

