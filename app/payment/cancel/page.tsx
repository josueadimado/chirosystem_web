"use client";

import { Loader } from "@/components/loader";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Shown when a patient leaves hosted checkout without paying, or opens this URL from a link.
 * Query params: optional invoice=<id> when the API appended it to the cancel URL.
 */
function PaymentCancelInner() {
  const searchParams = useSearchParams();
  const invoiceRaw = searchParams.get("invoice");
  const invoiceId =
    invoiceRaw && /^\d+$/.test(invoiceRaw.trim()) ? invoiceRaw.trim() : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-slate-900">Payment canceled</h1>
      <p className="text-slate-600">
        No charge was made. Use the payment link from your provider or pay at the front desk.
      </p>
      {invoiceId && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Pending invoice #{invoiceId} — you can try paying again when you&apos;re ready.
        </p>
      )}
      <Link href="/" className="text-sm font-semibold text-[#16a349] hover:underline">
        Back to booking
      </Link>
    </main>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader variant="page" label="Loading" sublabel="One moment…" />
        </div>
      }
    >
      <PaymentCancelInner />
    </Suspense>
  );
}
