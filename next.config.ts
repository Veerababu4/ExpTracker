import type { NextConfig } from "next";

// Security headers (DESIGN §7). The CSP has no nonces: they need every page rendered per request, which rules out
// the static shells of Partial Prerendering (Next.js CSP guide, "Without Nonces"). Scripts and styles may only come
// from this site; nothing may frame it. 'unsafe-eval' only in development (React's dev tools need it).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'", // inline style widths of the budget bars and charts
  "img-src 'self' blob: data:", // blob: = the receipt preview before upload
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const everywhere = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // browsers ignore it on http
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: everywhere },
      // Not on /receipts/…: a page CSP there stops the browser's PDF viewer. That route sets its own headers
      // (nosniff, private no-store, a sandbox CSP for photos).
      { source: "/((?!receipts/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Receipts (DESIGN §3.7): files up to 2 MB plus the other form fields and multipart overhead.
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
