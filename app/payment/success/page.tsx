import Link from "next/link";

/** Stripe Checkout redirects here after successful payment. */
export default function PaymentSuccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-[#166534]">Payment received</h1>
      <p className="text-slate-600">Thank you. Your payment was processed. You can close this window.</p>
      <Link href="/" className="text-sm font-semibold text-[#16a349] hover:underline">
        Back to booking
      </Link>
    </main>
  );
}
