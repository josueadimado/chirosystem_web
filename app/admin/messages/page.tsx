export default function AdminMessagesPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="card">
        <h1 className="mb-3 text-xl font-bold">Messages</h1>
        <input className="mb-3 w-full rounded-lg border border-slate-200 p-2" placeholder="Filter conversations" />
        {[
          "John Doe",
          "Maria Rodriguez",
          "Samuel Lee",
        ].map((name) => (
          <button key={name} className="mb-2 w-full rounded-lg border border-slate-200 p-2 text-left text-sm">{name}</button>
        ))}
      </section>
      <section className="card flex min-h-[500px] flex-col">
        <div className="mb-4 border-b border-slate-200 pb-3 font-semibold">John Doe</div>
        <div className="flex-1 space-y-3 text-sm">
          <p className="ml-auto max-w-md rounded-lg bg-teal-600 p-3 text-white">Reminder for tomorrow at 2:00 PM. Reply Y to confirm.</p>
          <p className="max-w-md rounded-lg bg-slate-100 p-3">I&apos;m stuck in traffic. Can we push my appointment a bit?</p>
        </div>
        <div className="mt-4 flex gap-2">
          <input className="flex-1 rounded-lg border border-slate-200 p-2" placeholder="Type your message..." />
          <button className="rounded-lg bg-teal-600 px-3 py-2 text-white">Send</button>
        </div>
      </section>
    </div>
  );
}
