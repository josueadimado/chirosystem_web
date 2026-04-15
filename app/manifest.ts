import type { MetadataRoute } from "next";

/** Web app manifest — enables “Install app” / Add to Home Screen on supported browsers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Relief Chiropractic",
    short_name: "Relief",
    description: "Relief Chiropractic — booking, staff portals, and clinic operations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ecfdf5",
    theme_color: "#16a349",
    categories: ["health", "medical", "business"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Book an appointment",
        short_name: "Book",
        description: "Open the public booking page",
        url: "/",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Patient check-in",
        short_name: "Kiosk",
        description: "Open the check-in kiosk",
        url: "/kiosk",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Doctor portal",
        short_name: "Doctor",
        description: "Sign in to the doctor dashboard",
        url: "/auth/sign-in",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
