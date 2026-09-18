import { redirect } from "next/navigation";

/** Old portal menu URL — keep bookmarks working by sending people to the home menu. */
export default function PortalStartRedirectPage() {
  redirect("/");
}
