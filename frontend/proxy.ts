import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/library(.*)",
  "/runs(.*)",
  "/settings(.*)",
]);
const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) {
      await auth.protect();
    }
    // Clerk will not render the sign-in form for a signed-in user, which leaves a blank page.
    if (isAuthPage(req)) {
      const { userId } = await auth();
      if (userId) return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  },
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes and Clerk's Frontend API proxy. With a production key on
    // *.vercel.app, clerkMiddleware serves clerk.browser.js from /__clerk; the static-file
    // rule above would otherwise skip it and the sign-in form would never load.
    "/(api|trpc|__clerk)(.*)",
  ],
};
