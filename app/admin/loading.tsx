import { Loader } from "@/components/loader";

/** Shown inside the admin layout while each admin screen loads. */
export default function AdminLoading() {
  return <Loader variant="page" label="Loading" sublabel="Preparing this page…" />;
}
