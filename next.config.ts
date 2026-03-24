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
};

export default nextConfig;
