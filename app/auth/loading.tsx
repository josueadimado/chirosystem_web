import { Loader } from "@/components/loader";

export default function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Loader variant="page" label="Sign-in" sublabel="Loading secure sign-in…" />
    </div>
  );
}
