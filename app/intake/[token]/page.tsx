"use client";

import { BrandLogo } from "@/components/brand-logo";
import { DigitalIntakeFormEditor } from "@/components/digital-intake-form-editor";
import { Loader } from "@/components/loader";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import type { IntakeFormPack, IntakeFormPackItem } from "@/lib/digital-intake";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function PublicIntakePage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";
  const [pack, setPack] = useState<IntakeFormPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeType, setActiveType] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<IntakeFormPack>(`/digital-intake/form/${encodeURIComponent(token)}/`);
      setPack(data);
      setActiveType((prev) => prev || data.forms[0]?.form_type || "");
    } catch (e) {
      setPack(null);
      setError(e instanceof ApiError ? e.message : "Could not open this intake link.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const active: IntakeFormPackItem | undefined = pack?.forms.find((f) => f.form_type === activeType);

  const onSubmit = async (payload: {
    answers: Record<string, unknown>;
    signature_name: string;
    save_as_draft: boolean;
    auto?: boolean;
  }) => {
    if (!token || !activeType) {
      throw new Error("This form is not ready to submit. Refresh the page or ask the clinic for a new link.");
    }
    const isAuto = Boolean(payload.auto);
    if (!isAuto) {
      setBusy(true);
      setSuccess("");
    }
    try {
      const res = await apiPostPublic<{
        detail: string;
        pack: IntakeFormPack;
      }>(`/digital-intake/submit/${encodeURIComponent(token)}/`, {
        form_type: activeType,
        answers: payload.answers,
        signature_name: payload.signature_name,
        save_as_draft: payload.save_as_draft,
      });
      // Keep pack metadata in sync, but do not remount the editor on every draft save.
      setPack(res.pack);
      if (!payload.save_as_draft) {
        setSuccess(res.detail);
      }
    } catch (e) {
      throw new Error(e instanceof ApiError ? e.message : "Submit failed.");
    } finally {
      if (!isAuto) setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[linear-gradient(180deg,#f3faf5_0%,#ffffff_40%,#f8fafc_100%)]">
      <header className="border-b border-emerald-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandLogo variant="full" className="max-h-12 sm:max-h-14" priority />
          <div className="flex items-center gap-3">
            <Link
              href="/intake"
              className="text-sm font-semibold text-[#0d5c2e] underline-offset-4 hover:underline"
            >
              ← Back
            </Link>
            <p className="hidden text-right text-xs font-medium text-slate-500 sm:block sm:text-sm">
              Patient intake
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader label="Loading your forms…" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-red-900">
            <h1 className="text-lg font-semibold">Link not available</h1>
            <p className="mt-2 text-sm">{error}</p>
            <p className="mt-3 text-sm">Call the clinic at 269-408-0303 if you need a new link.</p>
          </div>
        ) : pack ? (
          <div className="space-y-6">
            <div>
              <h1 className="font-serif text-3xl tracking-tight text-[#0d5c2e] sm:text-4xl">
                Hi {pack.patient.display_name}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                Please complete your intake before your visit. Fields we already know are filled in —
                you can change anything that looks wrong. Your progress is saved as you go.
              </p>
            </div>

            {pack.forms.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {pack.forms.map((f) => (
                  <button
                    key={f.form_type}
                    type="button"
                    onClick={() => {
                      setActiveType(f.form_type);
                      setSuccess("");
                    }}
                    className={
                      activeType === f.form_type
                        ? "rounded-full bg-[#0d5c2e] px-4 py-2 text-sm font-semibold text-white"
                        : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                    }
                  >
                    {f.label}
                    {f.status === "submitted" ? " ✓" : f.status === "draft" ? " (in progress)" : ""}
                  </button>
                ))}
              </div>
            ) : null}

            {success ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {success}
              </p>
            ) : null}

            {active ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-emerald-900/5 sm:p-6">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">{active.label}</h2>
                <DigitalIntakeFormEditor
                  key={active.form_type}
                  formType={active.form_type}
                  initial={active.answers}
                  alreadySubmitted={active.status === "submitted"}
                  busy={busy}
                  onExit={() => router.push("/intake")}
                  onSubmit={onSubmit}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
