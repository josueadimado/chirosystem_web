export default function DoctorMessagesPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="card space-y-2">
        <h1 className="text-xl font-bold">Messages</h1>
        <p className="text-sm text-slate-600">Conversations with your patients only.</p>
        <p className="text-sm text-slate-600">Messaging with your patients. (Coming soon — no backend yet.)</p>
        <input className="w-full rounded-lg border border-slate-200 p-2" placeholder="Search messages" />
        {["Jordan Lee", "David Wilson", "Emily Rodriguez"].map((name) => (
          <button key={name} className="w-full rounded-lg border border-slate-200 p-2 text-left text-sm hover:bg-slate-50">{name}</button>
        ))}
      </section>
      <section className="card flex min-h-[500px] flex-col">
        <div className="mb-4 border-b border-slate-200 pb-3 font-semibold">Jordan Lee</div>
        <div className="flex-1 space-y-3 text-sm">
          <p className="max-w-md rounded-lg bg-slate-100 p-3">Hi Dr. Smith, should I still come in at 11:00 AM?</p>
          <p className="ml-auto max-w-md rounded-lg bg-[#16a349] p-3 text-white">Yes, come in. We will reassess and adjust treatment.</p>
        </div>
        <div className="mt-4 flex gap-2">
          <input className="flex-1 rounded-lg border border-slate-200 p-2" placeholder="Type a message..." />
          <button className="rounded-lg bg-[#16a349] px-3 py-2 text-white">Send</button>
        </div>
      </section>
    </div>
  );
}
