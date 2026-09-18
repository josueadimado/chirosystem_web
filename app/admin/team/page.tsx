"use client";

import { IconMoreVertical, IconUserPlus } from "@/components/icons";
import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Pencil, Search, UserX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TeamRole = "owner_admin" | "doctor" | "staff";

type TeamMember = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  doctor_booking_category?: string | null;
  role: TeamRole;
  is_active: boolean;
  date_joined: string;
};

const ROLE_LABEL: Record<TeamRole, string> = {
  owner_admin: "Owner",
  doctor: "Doctor",
  staff: "Front desk",
};

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3.5 py-2.5 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

const GRID =
  "grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.55fr)] gap-2";

function RoleBadge({ role }: { role: TeamRole }) {
  const cls =
    role === "owner_admin"
      ? "bg-[#ede9fe] text-[#5b21b6]"
      : role === "doctor"
        ? "bg-[#ecfdf5] text-[#0d5c2e]"
        : "bg-[#ffedd5] text-[#9a3412]";
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", cls)}>
      {ROLE_LABEL[role]}
    </span>
  );
}

export default function AdminTeamPage() {
  const { runWithFeedback } = useAppFeedback();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [rows, setRows] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | TeamRole>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    full_name: "",
    phone: "",
    doctor_booking_category: "chiropractic" as "chiropractic" | "massage",
    role: "doctor" as TeamRole,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    doctor_booking_category: "chiropractic" as "chiropractic" | "massage",
    password: "",
    role: "doctor" as TeamRole,
    is_active: true,
  });

  const [deactivateMember, setDeactivateMember] = useState<TeamMember | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsOwner(getRoleCookie() === "owner_admin");
  }, []);

  useEffect(() => {
    if (menuOpenId == null) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpenId]);

  useEffect(() => {
    setMenuOpenId(null);
  }, [search, roleFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetAuth<TeamMember[]>("/team/");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load team.";
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner !== true) return;
    void load();
  }, [isOwner, load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.full_name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.username || "").toLowerCase().includes(q),
    );
  }, [rows, search, roleFilter]);

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setEditForm({
      email: m.email ?? "",
      full_name: m.full_name ?? "",
      phone: m.phone ?? "",
      doctor_booking_category:
        m.doctor_booking_category === "massage" ? "massage" : "chiropractic",
      password: "",
      role: m.role,
      is_active: m.is_active,
    });
    setEditOpen(true);
  };

  const submitAdd = async () => {
    const u = form.username.trim();
    const pw = form.password;
    if (!u || pw.length < 8) {
      setError("Username and password (8+ characters) are required.");
      return;
    }
    setAddSubmitting(true);
    setError("");
    await runWithFeedback(
      async () => {
        const body: Record<string, unknown> = {
          username: u,
          password: pw,
          email: form.email.trim() || "",
          full_name: form.full_name.trim() || "",
          phone: form.phone.trim() || "",
          role: form.role,
        };
        if (form.role === "doctor") {
          body.doctor_booking_category = form.doctor_booking_category;
        }
        await apiPost("/team/", body);
        setAddOpen(false);
        setForm({
          username: "",
          password: "",
          email: "",
          full_name: "",
          phone: "",
          doctor_booking_category: "chiropractic",
          role: "doctor",
        });
        await load();
      },
      {
        loadingMessage: "Creating account...",
        successMessage: "Team member added.",
        errorFallback: "Could not create this user.",
      },
    );
    setAddSubmitting(false);
  };

  const submitEdit = async () => {
    if (!editing) return;
    setEditSubmitting(true);
    setError("");
    const payload: Record<string, unknown> = {
      email: editForm.email.trim(),
      full_name: editForm.full_name.trim(),
      phone: editForm.phone.trim(),
      role: editForm.role,
      is_active: editForm.is_active,
    };
    if (editForm.role === "doctor") {
      payload.doctor_booking_category = editForm.doctor_booking_category;
    }
    if (editForm.password.trim().length >= 8) {
      payload.password = editForm.password;
    }
    await runWithFeedback(
      async () => {
        await apiPatch(`/team/${editing.id}/`, payload);
        setEditOpen(false);
        setEditing(null);
        await load();
      },
      {
        loadingMessage: "Saving...",
        successMessage: "Saved.",
        errorFallback: "Could not save changes.",
      },
    );
    setEditSubmitting(false);
  };

  const confirmDeactivate = async () => {
    if (!deactivateMember) return;
    setDeactivating(true);
    await runWithFeedback(
      async () => {
        await apiDelete(`/team/${deactivateMember.id}/`);
        setDeactivateMember(null);
        await load();
      },
      {
        loadingMessage: "Deactivating...",
        successMessage: "User deactivated.",
        errorFallback: "Could not deactivate.",
      },
    );
    setDeactivating(false);
  };

  if (isOwner === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <Loader variant="page" label="Loading" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-5 py-4">
          <p className="text-sm font-medium text-[#92400e]">
            Only the clinic owner can manage team logins here.
          </p>
          <Link
            href="/admin/providers"
            className="mt-2 inline-block text-sm font-semibold text-[#16a349] hover:underline"
          >
            Go to Doctors & providers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[#5a7a62]">
            {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
          </p>
          <span className="inline-flex items-center rounded-lg border border-[#ffedd5] bg-[#fff7ed] px-2.5 py-1 text-xs font-medium text-[#9a3412]">
            Owner-only
          </span>
          <Link href="/admin/providers" className="text-sm font-semibold text-[#16a349] hover:underline">
            Doctors & providers
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          <IconUserPlus className="h-4 w-4" />
          Add team member
        </button>
      </div>

      {error && !addOpen && !editOpen ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#d1e8d8] px-5 py-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a7a62]"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or username..."
              className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search team"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "all" | TeamRole)}
            className="min-w-[9rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            <option value="owner_admin">Owner</option>
            <option value="doctor">Doctor</option>
            <option value="staff">Front desk</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8">
              <Loader variant="page" label="Loading" />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-x-auto">
              <div className="min-w-[900px] shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <div className={cn(GRID, "px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]")}>
                  <span>Name</span>
                  <span>Role</span>
                  <span>Email</span>
                  <span>Username</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>

              <div className="min-h-0 min-w-[900px] flex-1 overflow-auto">
                {filtered.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-[#5a7a62]">
                    {rows.length === 0 ? "No team members yet." : "No accounts match."}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#d1e8d8]">
                    {filtered.map((m) => (
                      <li key={m.id} className={cn(GRID, "items-center px-5 py-3.5 hover:bg-[#f8fdf9]")}>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0d1f14]">{m.full_name || "-"}</p>
                          {m.role === "doctor" && m.doctor_booking_category ? (
                            <p className="mt-0.5 text-xs text-[#5a7a62]">
                              {m.doctor_booking_category === "massage" ? "Massage" : "Chiropractic"}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <RoleBadge role={m.role} />
                        </div>
                        <div className="min-w-0 truncate text-[#5a7a62]">{m.email || "-"}</div>
                        <div className="min-w-0 font-mono text-xs text-[#5a7a62]">{m.username}</div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                              m.is_active
                                ? "bg-[#f0fdf4] text-[#166534]"
                                : "bg-[#fee2e2] text-[#991b1b]",
                            )}
                          >
                            {m.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <div
                            className="relative inline-flex"
                            ref={menuOpenId === m.id ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={menuOpenId === m.id}
                              aria-label={`Actions for ${m.full_name || m.username}`}
                              onClick={() =>
                                setMenuOpenId((id) => (id === m.id ? null : m.id))
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d1e8d8] bg-white text-[#5a7a62] hover:bg-[#f8fdf9] hover:text-[#0d1f14]"
                            >
                              <IconMoreVertical className="h-4 w-4" />
                            </button>
                            {menuOpenId === m.id ? (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-[#d1e8d8] bg-white py-1 shadow-lg"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    openEdit(m);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1f14] hover:bg-[#f8fdf9]"
                                >
                                  <Pencil className="h-4 w-4 text-[#5a7a62]" aria-hidden />
                                  Edit
                                </button>
                                {m.is_active ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      setDeactivateMember(m);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#991b1b] hover:bg-[#fef2f2]"
                                  >
                                    <UserX className="h-4 w-4" aria-hidden />
                                    Deactivate
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <Dialog open={addOpen} onOpenChange={(o) => !addSubmitting && setAddOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">Add team member</DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Password must be at least 8 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            {error && addOpen ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
            ) : null}
            <label>
              <span className={fieldLabel}>Role</span>
              <select
                className={inputClass}
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as TeamRole }))}
              >
                <option value="doctor">Doctor</option>
                <option value="staff">Front desk</option>
                <option value="owner_admin">Owner / administrator</option>
              </select>
            </label>
            {form.role === "doctor" ? (
              <label>
                <span className={fieldLabel}>Doctor type</span>
                <select
                  className={inputClass}
                  value={form.doctor_booking_category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      doctor_booking_category: e.target.value as "chiropractic" | "massage",
                    }))
                  }
                >
                  <option value="chiropractic">Chiropractic</option>
                  <option value="massage">Massage</option>
                </select>
              </label>
            ) : null}
            <label>
              <span className={fieldLabel}>Username</span>
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="off"
              />
            </label>
            <label>
              <span className={fieldLabel}>Password</span>
              <input
                type="password"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span className={fieldLabel}>Full name</span>
              <input
                className={inputClass}
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </label>
            <label>
              <span className={fieldLabel}>Email</span>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              <span className={fieldLabel}>Phone</span>
              <input
                type="tel"
                className={inputClass}
                placeholder="Optional"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
          </div>
          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
            <Button
              type="button"
              variant="outline"
              disabled={addSubmitting}
              onClick={() => setAddOpen(false)}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addSubmitting}
              onClick={() => void submitAdd()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {addSubmitting ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => !editSubmitting && setEditOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">Edit {editing?.username}</DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Username cannot be changed. Leave password blank to keep it.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-1">
              <label>
                <span className={fieldLabel}>Role</span>
                <select
                  className={inputClass}
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as TeamRole }))}
                >
                  <option value="doctor">Doctor</option>
                  <option value="staff">Front desk</option>
                  <option value="owner_admin">Owner / administrator</option>
                </select>
              </label>
              {editForm.role === "doctor" ? (
                <label>
                  <span className={fieldLabel}>Doctor type</span>
                  <select
                    className={inputClass}
                    value={editForm.doctor_booking_category}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        doctor_booking_category: e.target.value as "chiropractic" | "massage",
                      }))
                    }
                  >
                    <option value="chiropractic">Chiropractic</option>
                    <option value="massage">Massage</option>
                  </select>
                </label>
              ) : null}
              <label>
                <span className={fieldLabel}>Full name</span>
                <input
                  className={inputClass}
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </label>
              <label>
                <span className={fieldLabel}>Email</span>
                <input
                  type="email"
                  className={inputClass}
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label>
                <span className={fieldLabel}>Phone</span>
                <input
                  type="tel"
                  className={inputClass}
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label>
                <span className={fieldLabel}>New password</span>
                <input
                  type="password"
                  className={inputClass}
                  placeholder="Leave blank to keep current"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
              <div className="flex items-center justify-between rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0d1f14]">Active</p>
                  <p className="text-xs text-[#5a7a62]">Can sign in</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editForm.is_active}
                  onClick={() => setEditForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                    editForm.is_active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      editForm.is_active ? "left-[1.375rem]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
            <Button
              type="button"
              variant="outline"
              disabled={editSubmitting}
              onClick={() => setEditOpen(false)}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editSubmitting}
              onClick={() => void submitEdit()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {editSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deactivateMember != null}
        onOpenChange={(open) => {
          if (!open && !deactivating) setDeactivateMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {deactivateMember ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#0d1f14]">
                  Deactivate {deactivateMember.full_name || deactivateMember.username}?
                </DialogTitle>
                <DialogDescription className="text-[#5a7a62]">
                  They will not be able to sign in. You can reactivate later by editing the account.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deactivating}
                  onClick={() => setDeactivateMember(null)}
                  className="border-[#d1e8d8]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={deactivating}
                  onClick={() => void confirmDeactivate()}
                  className="bg-[#991b1b] text-white hover:bg-[#7f1d1d]"
                >
                  {deactivating ? "Deactivating..." : "Deactivate"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
