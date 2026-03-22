import Link from "next/link";

export default function PaymentCancelPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-slate-900">Payment canceled</h1>
      <p className="text-slate-600">No charge was made. Use the payment link from your provider or pay at the front desk.</p>
      <Link href="/" className="text-sm font-semibold text-[#16a349] hover:underline">
        Back to booking
      </Link>
    </main>
  );
}
