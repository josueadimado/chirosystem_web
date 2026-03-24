"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
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
}: {
  item: NavItem;
  pathname: string;
  open: boolean;
  accent: "default" | "doctor" | "admin";
}) {
  const active = pathname === item.href;
  return (
    <Link
      key={item.href}
      href={item.href}
      title={!open ? item.label : undefined}
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

  return (
    <aside
      className={`flex flex-col border-r transition-[width] duration-200 ${
        accent === "doctor" || accent === "admin"
          ? "border-primary/10 bg-gradient-to-b from-sidebar via-sidebar to-primary/[0.06]"
          : "border-border bg-sidebar"
      } ${open ? "w-72" : "w-20"}`}
    >
      <div
        className={`flex items-center gap-2 p-4 ${open ? "" : "justify-center px-0"}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <IconLogo className="h-6 w-6" />
        </div>
        {open && (
          <p className="text-xl font-extrabold leading-tight text-[#e9982f] truncate">
            {title}
          </p>
        )}
      </div>
      <nav className={`flex-1 space-y-1 px-3 pb-4 overflow-y-auto ${open ? "" : "px-2"}`}>
        {useGroups ? (
          groups.map((group) => (
            <div key={group.label || "main"} className="space-y-1">
              {open && group.label ? (
                <p className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} open={open} accent={accent} />
              ))}
            </div>
          ))
        ) : (
          items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} open={open} accent={accent} />
          ))
        )}
      </nav>
    </aside>
  );
}

