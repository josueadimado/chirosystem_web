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
  if (!active) return "text-slate-700 hover:bg-slate-100/90";
  if (accent === "admin" || accent === "doctor")
    return "bg-[#16a349]/12 text-[#0d5c2e] shadow-sm shadow-emerald-900/5";
  return "bg-slate-100 text-slate-900";
}

function navIconClass(accent: "default" | "doctor" | "admin", active: boolean): string {
  if (!active) return "text-slate-500";
  if (accent === "admin" || accent === "doctor") return "text-[#16a349]";
  return "text-slate-700";
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
          ? "border-emerald-100/90 bg-gradient-to-b from-white via-white to-emerald-50/35"
          : "border-slate-200 bg-white"
      } ${open ? "w-72" : "w-20"}`}
    >
      <div
        className={`flex items-center gap-2 p-4 ${open ? "" : "justify-center px-0"}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#16a349] text-white">
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
                <p className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 first:mt-0">
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

