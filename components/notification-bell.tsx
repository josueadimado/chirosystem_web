"use client";

import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { IconBell } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type StaffNotification = {
  id: number;
  kind: string;
  message: string;
  appointment: number | null;
  read_at: string | null;
  created_at: string;
};

function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Header bell: loads unread count for the logged-in user and shows recent in-app alerts
 * (check-ins, new bookings, schedule changes for that doctor’s account).
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchUnread = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chiroflow_access_token") : null;
    if (!token) return;
    try {
      const data = await apiGetAuth<{ unread_count: number }>("/notifications/unread-count/");
      setUnread(data.unread_count);
    } catch {
      /* ignore when offline / logged out */
    }
  }, []);

  const fetchList = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chiroflow_access_token") : null;
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGetAuth<StaffNotification[]>("/notifications/");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread, pathname]);

  useEffect(() => {
    const id = window.setInterval(() => fetchUnread(), 45000);
    return () => window.clearInterval(id);
  }, [fetchUnread]);

  useEffect(() => {
    if (!open) return;
    fetchList();
    fetchUnread();
  }, [open, fetchList, fetchUnread]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markOneRead = async (n: StaffNotification) => {
    if (n.read_at) return;
    try {
      await apiPost<StaffNotification>(`/notifications/${n.id}/mark_read/`, {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* non-fatal */
    }
  };

  const markAllRead = async () => {
    try {
      await apiPost("/notifications/mark_all_read/", {});
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
      setUnread(0);
    } catch {
      /* non-fatal */
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <IconBell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 bg-white shadow-lg"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-[#16a349] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
            {error && <p className="p-4 text-sm text-rose-700">{error}</p>}
            {!loading && !error && items.length === 0 && (
              <p className="p-4 text-sm text-slate-500">No notifications yet.</p>
            )}
            {!loading &&
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markOneRead(n)}
                  className={`w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                    n.read_at ? "text-slate-600" : "bg-emerald-50/50 font-medium text-slate-900"
                  }`}
                >
                  <span className="line-clamp-3">{n.message}</span>
                  <span className="mt-1 block text-xs text-slate-400">{formatTimeAgo(n.created_at)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
