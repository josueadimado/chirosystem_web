import { Loader } from "@/components/loader";

export default function KioskLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <Loader variant="page" label="Check-in" sublabel="Starting kiosk…" />
    </div>
  );
}
