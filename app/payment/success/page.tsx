"use client";

import { Loader } from "@/components/loader";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Square payment links redirect here after a successful checkout (redirect_url).
 * Query params: square=1, invoice=<id> (invoice is optional but set by the API when building the link).
 */
function PaymentSuccessInner() {
  const searchParams = useSearchParams();
  const invoiceRaw = searchParams.get("invoice");
  const invoiceId =
    invoiceRaw && /^\d+$/.test(invoiceRaw.trim()) ? invoiceRaw.trim() : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-[#166534]">Payment received</h1>
      <p className="text-slate-600">
        Thank you. Your payment was processed. You can close this window.
      </p>
      {invoiceId && (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
          Reference: invoice #{invoiceId}
        </p>
      )}
      <Link href="/" className="text-sm font-semibold text-[#16a349] hover:underline">
        Back to booking
      </Link>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader variant="page" label="Loading" sublabel="One moment…" />
        </div>
      }
    >
      <PaymentSuccessInner />
    </Suspense>
  );
}
