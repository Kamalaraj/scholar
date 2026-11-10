import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").origin;

// Clerk serves its scripts and API from the Frontend API host of the instance. Development
// instances live under clerk.accounts.dev; set CLERK_CSP_HOSTS to the production host(s).
const clerkHosts = (process.env.CLERK_CSP_HOSTS ?? "https://*.clerk.accounts.dev")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const csp = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts; a nonce-based policy needs dynamic rendering for
  // every page, so 'unsafe-inline' stays for scripts (documented in the audit). Dev needs eval.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}${clerkHosts.join(" ")} https://challenges.cloudflare.com https://*.protect.clerk.com`,
  "style-src 'self' 'unsafe-inline'",
  // Source favicons come from Google's icon service; Clerk avatars from img.clerk.com.
  "img-src 'self' data: blob: https://img.clerk.com https://www.google.com https://*.gstatic.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${clerkHosts.join(" ")} https://*.protect.clerk.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  `frame-src https://challenges.cloudflare.com ${clerkHosts.join(" ")}`,
  "worker-src 'self' blob:",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets a production build (Lighthouse, audits) live beside the dev server's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
