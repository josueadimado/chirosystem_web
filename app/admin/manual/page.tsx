import dynamic from "next/dynamic";
import { Loader } from "@/components/loader";

// PortalManual is large and only appears on this low-traffic page — load it lazily.
const PortalManual = dynamic(
  () => import("@/components/portal-manual").then((m) => ({ default: m.PortalManual })),
  { loading: () => <Loader variant="page" label="Loading manual" /> },
);

export default function AdminManualPage() {
  return <PortalManual role="admin" />;
}
