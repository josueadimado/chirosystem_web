import { AdminLayoutClient } from "./admin-layout-client";
import type { Metadata, Viewport } from "next";

/** Staff admin area: same PWA manifest as sign-in so installs open the staff entry point, not public booking. */
export const metadata: Metadata = {
  manifest: "/manifest-staff.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Relief Staff",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16a349" },
    { media: "(prefers-color-scheme: dark)", color: "#0d5c2e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
