"use client";

import { AdminPageIntro } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type InsuranceCompanyRow = {
  id: number;
  name: string;
  claim_email: string;
  phone: string;
  notes: string;
  default_plan_type: string;
  is_active: boolean;
};

const PLAN_OPTIONS = [
  { value: "group", label: "Group health plan" },
  { value: "medicare", label: "Medicare" },
  { value: "medicaid", label: "Medicaid" },
  { value: "tricare", label: "TRICARE" },
  { value: "champva", label: "CHAMPVA" },
  { value: "feca", label: "FECA" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  name: "",
  claim_email: "",
  phone: "",
  notes: "",
  default_plan_type: "group",
  is_active: true,
};

const fieldLabel = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500";
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

export default function AdminInsuranceCompaniesPage() {
  const { runWithFeedback } = useAppFeedback();
  const [rows, setRows] = useState<InsuranceCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceCompanyRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetAuth<InsuranceCompanyRow[]>("/insurance-companies/");
      setRows((data || []).map((d) => ({ ...d, is_active: d.is_active !== false })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load insurance companies.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (!showInactive) list = list.filter((d) => d.is_active);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.claim_email || "").toLowerCase().includes(q) ||
        (d.phone || "").toLowerCase().includes(q),
    );
  }, [rows, search, showInactive]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (row: InsuranceCompanyRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      claim_email: row.claim_email || "",
      phone: row.phone || "",
      notes: row.notes || "",
      default_plan_type: row.default_plan_type || "group",
      is_active: row.is_active,
    });
    setFormOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    await runWithFeedback(
      async () => {
        const body = {
          name,
          claim_email: form.claim_email.trim(),
          phone: form.phone.trim(),
          notes: form.notes.trim(),
          default_plan_type: form.default_plan_type || "group",
          is_active: form.is_active,
        };
        if (editing) {
          await apiPatch(`/insurance-companies/${editing.id}/`, body);
        } else {
          await apiPost("/insurance-companies/", body);
        }
        setFormOpen(false);
        await load();
      },
      {
        loadingMessage: editing ? "Saving…" : "Adding company…",
        successMessage: editing ? "Insurance company updated." : "Insurance company added.",
        errorFallback: "Could not save insurance company.",
      },
    );
    setSaving(false);
  };

  const remove = async (row: InsuranceCompanyRow) => {
    if (
      !window.confirm(
        `Delete ${row.name}? Patients assigned to it will keep their typed payer name, but the link will be cleared.`,
      )
    ) {
      return;
    }
    await runWithFeedback(
      async () => {
        await apiDelete(`/insurance-companies/${row.id}/`);
        await load();
      },
      {
        loadingMessage: "Deleting…",
        successMessage: "Insurance company removed.",
        errorFallback: "Could not delete.",
      },
    );
  };

  return (
    <div className="space-y-8">
      <AdminPageIntro
        title="Insurance companies"
        description="Add insurance payers once here, then assign them on each patient’s chart. Claims use the company name (and claim email when you email a CMS-1500)."
        pageHelp="This is a clinic list — not connected to clearinghouses. Keep names matching what you print on claims."
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company name, email, or phone…"
          className="min-w-[14rem] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show inactive
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
        >
          Add company
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <Loader label="Loading insurance companies…" />
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
          No insurance companies yet. Click <strong>Add company</strong> to create the first one.
        </p>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Claim email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Default plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    {row.notes ? <p className="mt-0.5 text-xs text-slate-500">{row.notes}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.claim_email || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {PLAN_OPTIONS.find((p) => p.value === row.default_plan_type)?.label ||
                      row.default_plan_type ||
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        row.is_active ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="mr-2 text-sm font-semibold text-[#0d5c2e] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(row)}
                      className="text-sm font-semibold text-rose-700 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit insurance company" : "Add insurance company"}</DialogTitle>
            <DialogDescription>
              Patients can pick this company from a dropdown on their chart.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label>
              <span className={fieldLabel}>Company name</span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Blue Cross Blue Shield of Michigan"
              />
            </label>
            <label>
              <span className={fieldLabel}>Claim email (optional)</span>
              <input
                type="email"
                className={inputClass}
                value={form.claim_email}
                onChange={(e) => setForm((f) => ({ ...f, claim_email: e.target.value }))}
                placeholder="claims@example.com"
              />
            </label>
            <label>
              <span className={fieldLabel}>Phone (optional)</span>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label>
              <span className={fieldLabel}>Default plan type</span>
              <select
                className={inputClass}
                value={form.default_plan_type}
                onChange={(e) => setForm((f) => ({ ...f, default_plan_type: e.target.value }))}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={fieldLabel}>Notes (optional)</span>
              <input
                className={inputClass}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal note"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded border-slate-300"
              />
              Active (show in patient dropdown)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !form.name.trim()}
              onClick={() => void save()}
              className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add company"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
