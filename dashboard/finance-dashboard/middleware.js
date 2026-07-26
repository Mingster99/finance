export { auth as middleware } from "@/auth";

/**
 * Only pages are guarded here. The /api/data route checks the session
 * itself — a middleware-only guard would leave it callable if the
 * matcher were ever misconfigured.
 */
export const config = {
  matcher: ["/dashboard/:path*"],
};
