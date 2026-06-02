import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * Server-side proxy target for `/api/v1/*` (not exposed to the browser).
 * - Docker web container: `http://api:8000` (set in root `docker-compose.yml` when using full stack)
 * - Local `npm run dev`: defaults to `http://127.0.0.1:8001`
 */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "http://127.0.0.1:8001").replace(/\/$/, "");

const withBundleAnalyzer = bundleAnalyzer({
  // Run: ANALYZE=true npm run build  — opens treemap reports in your browser.
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Django/DRF require trailing slashes. Next.js otherwise 308-strips them on /api/v1/* and
  // fights proxy.ts → infinite redirect loop (booking page shows 404 / failed fetch).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*/",
        destination: `${apiProxyTarget}/api/v1/:path*/`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*/`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
