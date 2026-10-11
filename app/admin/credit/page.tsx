"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { SquareTerminalCheckoutPoller } from "@/components/square-terminal-checkout";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { formatInstantMonthDayYearTime } from "@/lib/format-date";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

type PatientHit = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  credit_balance?: string;
};

type CreditTxn = {
  id: number;
  kind: string;
  amount: string;
  balance_after: string;
  note: string;
  created_at: string;
};

type Ledger = {
  patient_id: number;
  patient_name: string;
  credit_balance: string;
  transactions: CreditTxn[];
};

function money(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (Number.isNaN(n)) return String(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function kindLabel(kind: string, note: string): string {
  if (kind === "apply_to_invoice") return "Used on a bill";
  if (kind === "adjustment") return "Adjustment";
  if ((note || "").startsWith("square_payment:")) return "Added — card reader";
  return "Added";
}

export default function PatientCreditPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientHit | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [terminalCheckoutId, setTerminalCheckoutId] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void apiGetAuth<{ results: PatientHit[] }>(
        `/patients/?search=${encodeURIComponent(q)}&page_size=20`,
      )
        .then((data) => {
          if (!cancelled) setHits(data.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const loadLedger = async (patientId: number) => {
    setLedgerLoading(true);
    try {
      const data = await apiGetAuth<Ledger>(`/admin/patient_credit_ledger/?patient_id=${patientId}`, {
        cache: "no-store",
      });
      setLedger(data);
    } catch (e) {
      setLedger(null);
      toast.error(e instanceof ApiError ? e.message : "Could not load this patient's credit.");
    } finally {
      setLedgerLoading(false);
    }
  };

  const choosePatient = (patient: PatientHit) => {
    setSelected(patient);
    setTerminalCheckoutId(null);
    setAmount("");
    setNote("");
    void loadLedger(patient.id);
  };

  const parsedAmount = parseFloat(amount);
  const amountOk = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  const addCredit = async () => {
    if (!selected || !amountOk) {
      toast.error("Choose a patient and enter an amount.");
      return;
    }
    setBusy(true);
    const saved = await runWithFeedback(
      async () => {
        await apiPost("/admin/patient_credit_topup/", {
          patient_id: selected.id,
          amount,
          note,
        });
        await loadLedger(selected.id);
        return true;
      },
      {
        loadingMessage: "Adding credit…",
        successMessage: "Credit added.",
        errorFallback: "Could not add credit.",
      },
    );
    setBusy(false);
    if (saved) {
      setAmount("");
      setNote("");
    }
  };

  const chargeReader = async () => {
    if (!selected || !amountOk) {
      toast.error("Choose a patient and enter an amount.");
      return;
    }
    if (parsedAmount < 1) {
      toast.error("The card reader needs at least $1.00.");
      return;
    }
    setBusy(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ checkout_id: string }>("/admin/patient_credit_topup_terminal/", {
          patient_id: selected.id,
          amount,
        });
        setTerminalCheckoutId(out.checkout_id);
      },
      {
        loadingMessage: "Sending amount to the card reader…",
        successMessage: "Card reader is ready. Have the patient pay on the device.",
        errorFallback: "Could not start the card reader.",
      },
    );
    setBusy(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="text-sm text-slate-600">
        Search for the patient, choose their name, enter the amount, then add the credit. Use{" "}
        <strong>Add credit</strong> after cash is already collected. Use <strong>Charge card reader</strong> to take a
        card on the Square reader.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-4">
          <label className="block text-sm font-semibold text-slate-800">
            Find patient
            <span className="relative mt-2 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a name or phone"
                className="w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] py-2.5 pl-9 pr-3 text-sm"
              />
            </span>
          </label>
          <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
            {searching ? <p className="px-1 py-3 text-sm text-slate-500">Searching…</p> : null}
            {!searching && query.trim().length < 2 ? (
              <p className="px-1 py-6 text-sm text-slate-500">Type at least two letters of the name.</p>
            ) : null}
            {!searching && query.trim().length >= 2 && hits.length === 0 ? (
              <p className="px-1 py-6 text-sm text-slate-500">No patient matches that search.</p>
            ) : null}
            {hits.map((patient) => {
              const active = selected?.id === patient.id;
              return (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => choosePatient(patient)}
                  className={
                    active
                      ? "flex w-full items-center justify-between gap-3 rounded-lg border border-[#16a349] bg-[#ecfdf5] px-3 py-2.5 text-left"
                      : "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left hover:bg-[#f5f5f5]"
                  }
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {patient.first_name} {patient.last_name}
                    </span>
                    <span className="block text-xs text-slate-500">{patient.phone || "No phone"}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[#0d5c2e]">
                    {money(patient.credit_balance || "0")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[#e8e8e8] bg-white p-4">
          {!selected ? (
            <p className="py-10 text-center text-sm text-slate-500">Select a patient to add credit.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0d5c2e]">
                  {selected.first_name} {selected.last_name}
                </h2>
                <p className="text-sm text-slate-500">{selected.phone || "No phone on file"}</p>
                <p className="mt-2 text-sm text-slate-700">
                  Credit now:{" "}
                  <span className="text-base font-semibold text-[#0d5c2e]">
                    {ledgerLoading ? "…" : money(ledger?.credit_balance || selected.credit_balance || "0")}
                  </span>
                </p>
              </div>

              <label className="block text-sm font-semibold text-slate-800">
                Amount
                <input
                  value={amount}
                  inputMode="decimal"
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Note (optional)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Example: cash at the desk"
                  className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] px-3 py-2.5 text-sm"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy || !amountOk}
                  onClick={() => void addCredit()}
                  className="rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                >
                  {busy ? "Working…" : "Add credit"}
                </button>
                <button
                  type="button"
                  disabled={busy || !amountOk}
                  onClick={() => void chargeReader()}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Charge card reader
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Add credit does not charge a card. Charge card reader needs at least $1.00 and adds the credit only
                after the reader says the payment went through.
              </p>

              {terminalCheckoutId ? (
                <SquareTerminalCheckoutPoller
                  checkoutId={terminalCheckoutId}
                  statusPath="/admin/terminal_checkout_status/"
                  onComplete={() => {
                    setTerminalCheckoutId(null);
                    setAmount("");
                    toast.success("Card payment finished. Credit was added.");
                    void loadLedger(selected.id);
                  }}
                  onTerminalError={(msg) => {
                    setTerminalCheckoutId(null);
                    toast.error(msg);
                  }}
                />
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-slate-800">Recent credit activity</h3>
                {ledgerLoading ? (
                  <p className="mt-2 text-sm text-slate-500">Loading…</p>
                ) : (ledger?.transactions.length ?? 0) === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No credit activity yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[#e8e8e8]">
                    {ledger?.transactions.slice(0, 8).map((txn) => (
                      <li key={txn.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <span>
                          <span className="block font-medium text-slate-800">{kindLabel(txn.kind, txn.note)}</span>
                          <span className="block text-xs text-slate-500">
                            {formatInstantMonthDayYearTime(txn.created_at)}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block font-semibold tabular-nums">{money(txn.amount)}</span>
                          <span className="block text-xs text-slate-500">Balance {money(txn.balance_after)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
