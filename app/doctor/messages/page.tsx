import { DoctorPageIntro } from "@/components/doctor-shell";
import Link from "next/link";

/** Placeholder — not linked from the doctor sidebar until messaging is built. */
export default function DoctorMessagesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DoctorPageIntro
        title="Messages"
        description="Patient texting is not available in this version yet."
        pageHelp="Use chart notes on each visit so the next provider sees important context. The clinic can still call or text patients outside this app."
      />
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Coming soon</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          A shared inbox for patient texts will live here later. For now, document follow-ups in the chart note on each appointment.
        </p>
        <Link
          href="/doctor/dashboard"
          className="mt-6 inline-flex rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
