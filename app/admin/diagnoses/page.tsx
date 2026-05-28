"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
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

type DiagnosisRow = {
  id: number;
  code: string;
  description: string;
  is_active: boolean;
};

const emptyForm = { code: "", description: "", is_active: true };

const fieldLabel = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500";
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

export default function AdminDiagnosesPage() {
  const { runWithFeedback } = useAppFeedback();
  const [rows, setRows] = useState<DiagnosisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiagnosisRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = (await apiGetAuth<DiagnosisRow[]>("/diagnoses/")) as DiagnosisRow[];
      setRows(data.map((d) => ({ ...d, is_active: d.is_active !== false })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load diagnoses.");
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
      (d) => d.code.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
  }, [rows, search, showInactive]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (d: DiagnosisRow) => {
    setEditing(d);
    setForm({ code: d.code, description: d.description, is_active: d.is_active });
    setFormOpen(true);
  };

  const save = async () => {
    const code = form.code.trim();
    const description = form.description.trim();
    if (!code || !description) {
      return;
    }
    setSaving(true);
    await runWithFeedback(
      async () => {
        const body = { code, description, is_active: form.is_active };
        if (editing) {
          await apiPatch(`/diagnoses/${editing.id}/`, body);
        } else {
          await apiPost("/diagnoses/", body);
        }
        setFormOpen(false);
        await load();
      },
      {
        loadingMessage: editing ? "Saving…" : "Adding diagnosis…",
        successMessage: editing ? "Diagnosis updated." : "Diagnosis added.",
        errorFallback: "Could not save diagnosis.",
      },
    );
    setSaving(false);
  };

  const remove = async (d: DiagnosisRow) => {
    if (!window.confirm(`Delete diagnosis ${d.code}? This cannot be undone.`)) return;
    await runWithFeedback(
      async () => {
        await apiDelete(`/diagnoses/${d.id}/`);
        await load();
      },
      {
        loadingMessage: "Deleting…",
        successMessage: "Diagnosis removed.",
        errorFallback: "Could not delete.",
      },
    );
  };

  return (
    <div className="space-y-8">
      <AdminPageIntro
        title="Diagnoses & codes"
        description="Build the diagnosis list doctors pick during consultations. Each entry has a code and description — both appear on the patient bill and in visit history."
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or description…"
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
          Add diagnosis
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <Loader label="Loading diagnoses…" />
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
          No diagnoses yet. Click <strong>Add diagnosis</strong> to create the first code.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{d.code}</td>
                  <td className="px-4 py-3 text-slate-800">{d.description}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        d.is_active ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {d.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="mr-2 text-sm font-semibold text-[#0d5c2e] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(d)}
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
            <DialogTitle>{editing ? "Edit diagnosis" : "Add diagnosis"}</DialogTitle>
            <DialogDescription>
              Doctors will select from active diagnoses during consultations. Code and description print on the bill.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label>
              <span className={fieldLabel}>Code</span>
              <input
                className={inputClass}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. M54.5"
              />
            </label>
            <label>
              <span className={fieldLabel}>Description</span>
              <input
                className={inputClass}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Low back pain"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded border-slate-300"
              />
              Active (visible to doctors)
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !form.code.trim() || !form.description.trim()}
              onClick={() => void save()}
              className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AdminSectionLabel>Tip</AdminSectionLabel>
      <p className="text-sm text-slate-600">
        Inactive diagnoses stay on old visits but doctors cannot select them for new consultations.
      </p>
    </div>
  );
}
