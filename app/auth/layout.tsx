import { InstallAppCallout } from "@/components/install-app-callout";
import type { Metadata, Viewport } from "next";

/** Staff-only routes: use the staff PWA manifest so “Add to Home Screen” opens sign-in, not public booking. */
export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Secure sign-in for Relief Chiropractic staff.",
  applicationName: "Relief — Staff",
  manifest: "/manifest-staff.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Relief Staff",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d5c2e" },
    { media: "(prefers-color-scheme: dark)", color: "#052e18" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <InstallAppCallout variant="staff" />
    </>
  );
}
