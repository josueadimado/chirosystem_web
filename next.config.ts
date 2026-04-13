import type { NextConfig } from "next";

/**
 * Server-side proxy target for `/api/v1/*` (not exposed to the browser).
 * - Docker web container: `http://api:8000` (set in apps/web/docker-compose.yml)
 * - Local `npm run dev`: defaults to `http://127.0.0.1:8001`
 */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "http://127.0.0.1:8001").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
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

export default nextConfig;
