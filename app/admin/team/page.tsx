"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { IconUserPlus } from "@/components/icons";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type TeamRole = "owner_admin" | "doctor" | "staff";

type TeamMember = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: TeamRole;
  is_active: boolean;
  date_joined: string;
};

const ROLE_LABEL: Record<TeamRole, string> = {
  owner_admin: "Owner / admin",
  doctor: "Doctor",
  staff: "Staff (desk)",
};

function RoleBadge({ role }: { role: TeamRole }) {
  const cls =
    role === "owner_admin"
      ? "bg-violet-100 text-violet-900 ring-violet-200"
      : role === "doctor"
        ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
        : "bg-slate-100 text-slate-800 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
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

  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    full_name: "",
    role: "doctor" as TeamRole,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "doctor" as TeamRole,
    is_active: true,
  });

  useEffect(() => {
    setIsOwner(getRoleCookie() === "owner_admin");
  }, []);

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
    load();
  }, [isOwner, load]);

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setEditForm({
      email: m.email ?? "",
      full_name: m.full_name ?? "",
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
        await apiPost("/team/", {
          username: u,
          password: pw,
          email: form.email.trim() || "",
          full_name: form.full_name.trim() || "",
          role: form.role,
        });
        setAddOpen(false);
        setForm({ username: "", password: "", email: "", full_name: "", role: "doctor" });
        await load();
      },
      {
        loadingMessage: "Creating account…",
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
      role: editForm.role,
      is_active: editForm.is_active,
    };
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
        loadingMessage: "Saving…",
        successMessage: "Saved.",
        errorFallback: "Could not save changes.",
      },
    );
    setEditSubmitting(false);
  };

  const deactivate = async (m: TeamMember) => {
    if (
      !window.confirm(
        `Deactivate “${m.full_name || m.username}”? They won’t be able to sign in. You can reactivate later by editing the account.`,
      )
    ) {
      return;
    }
    await runWithFeedback(
      async () => {
        await apiDelete(`/team/${m.id}/`);
        await load();
      },
      {
        loadingMessage: "Deactivating…",
        successMessage: "User deactivated.",
        errorFallback: "Could not deactivate.",
      },
    );
  };

  if (isOwner === null) {
    return (
      <div className="space-y-6">
        <AdminPageIntro title="Team & logins" description="Loading…" />
        <Loader variant="page" label="Loading" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <AdminPageIntro
          title="Team & logins"
          description="Only the clinic owner can create administrators and staff logins here."
          pageHelp="Desk staff can still add doctors under Providers — that page creates doctor logins and booking profiles."
        />
        <div className="admin-panel border-amber-200 bg-amber-50 text-amber-950">
          <p className="text-sm font-medium">You’re signed in as staff. Ask an owner to add owner or staff accounts, or use Doctors & providers to add doctors.</p>
          <Link href="/admin/providers" className="mt-3 inline-block text-sm font-semibold text-[#0d5c2e] hover:underline">
            Go to Doctors & providers →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Team & logins"
        description="Create owner admins, doctors, and desk staff. Doctors also get a scheduling profile — you can refine visit types on Doctors & providers."
        pageHelp={
          <>
            <strong>Doctors</strong> should usually be added under{" "}
            <Link href="/admin/providers" className="font-semibold text-[#0d5c2e] hover:underline">
              Doctors & providers
            </Link>{" "}
            so online booking services are assigned. Use this page when you need <strong>staff</strong> or extra{" "}
            <strong>owner</strong> accounts, or to manage roles in one list.
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSectionLabel help="Everyone who can sign in to the admin or doctor apps (except patients).">
          Accounts
        </AdminSectionLabel>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="gap-2 bg-[#16a349] hover:bg-[#13823d]"
        >
          <IconUserPlus className="h-4 w-4" />
          Add team member
        </Button>
      </div>

      {error && (
        <div className="admin-panel border-rose-200 bg-rose-50 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <Loader variant="page" label="Loading team" sublabel="Fetching accounts…" />
      ) : (
        <div className="admin-panel overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No team members yet. Click “Add team member”.
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{m.full_name || "—"}</div>
                      <div className="text-xs text-slate-500">{m.email || "No email"}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{m.username}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={m.role} />
                    </td>
                    <td className="px-4 py-3">
                      {m.is_active ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-slate-500">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        className="mr-2 text-sm font-medium text-[#16a349] hover:underline"
                      >
                        Edit
                      </button>
                      {m.is_active && (
                        <button
                          type="button"
                          onClick={() => deactivate(m)}
                          className="text-sm font-medium text-rose-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => !addSubmitting && setAddOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Choose a role and login. Password must be at least 8 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="admin-input mt-1 w-full py-2"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as TeamRole }))}
              >
                <option value="doctor">Doctor</option>
                <option value="staff">Staff (desk)</option>
                <option value="owner_admin">Owner / administrator</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                For doctors who see patients online, consider also opening{" "}
                <Link href="/admin/providers" className="text-[#0d5c2e] underline">
                  Doctors & providers
                </Link>{" "}
                to assign visit types.
              </p>
            </div>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                className="mt-1"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                className="mt-1"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                className="mt-1"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                className="mt-1"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={addSubmitting}>
                Cancel
              </Button>
              <Button type="button" onClick={submitAdd} disabled={addSubmitting} className="bg-[#16a349] hover:bg-[#13823d]">
                {addSubmitting ? "Saving…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => !editSubmitting && setEditOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.username}</DialogTitle>
            <DialogDescription>Username cannot be changed. Leave password blank to keep the current one.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 pt-2">
              <div>
                <Label htmlFor="erole">Role</Label>
                <select
                  id="erole"
                  className="admin-input mt-1 w-full py-2"
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as TeamRole }))}
                >
                  <option value="doctor">Doctor</option>
                  <option value="staff">Staff (desk)</option>
                  <option value="owner_admin">Owner / administrator</option>
                </select>
              </div>
              <div>
                <Label htmlFor="efull">Full name</Label>
                <Input
                  id="efull"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="eemail">Email</Label>
                <Input
                  id="eemail"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="epw">New password</Label>
                <Input
                  id="epw"
                  type="password"
                  placeholder="Leave blank to keep current"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="eactive"
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <Label htmlFor="eactive" className="font-normal">
                  Active (can sign in)
                </Label>
                <HelpTip label="Active">Uncheck to block login without deleting history.</HelpTip>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSubmitting}>
                  Cancel
                </Button>
                <Button type="button" onClick={submitEdit} disabled={editSubmitting} className="bg-[#16a349] hover:bg-[#13823d]">
                  {editSubmitting ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
