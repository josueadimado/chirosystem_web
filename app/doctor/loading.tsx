import { Loader } from "@/components/loader";

/** Shown inside the doctor layout while each doctor screen loads. */
export default function DoctorLoading() {
  return <Loader variant="page" label="Loading" sublabel="Preparing this page…" />;
}
