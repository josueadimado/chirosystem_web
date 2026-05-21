import { AdminPageIntro } from "@/components/admin-shell";
import Link from "next/link";

/** Placeholder — patient SMS inbox is not wired up yet; route kept for future use (not in sidebar). */
export default function AdminMessagesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AdminPageIntro
        title="Messages"
        description="Two-way texting with patients is planned but not available in this version yet."
        pageHelp="You can still reach patients by phone. Appointment reminders are sent automatically by the system when visits are booked or changed."
      />
      <div className="admin-panel border-dashed border-slate-300 bg-slate-50/80 text-center">
        <p className="text-lg font-semibold text-slate-900">Coming soon</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          This screen will list text conversations with patients. For now, use the schedule and patient chart for visit updates, or call
          patients directly.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/admin/schedule"
            className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
          >
            Open schedule
          </Link>
          <Link
            href="/admin/patients"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Find a patient
          </Link>
        </div>
      </div>
    </div>
  );
}
