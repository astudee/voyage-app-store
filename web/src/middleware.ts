import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login
     * - /api/auth (NextAuth routes)
     * - /api/test-snowflake (unauthenticated test endpoint)
     * - /api/documents/reset-schema (schema reset endpoint)
     * - /api/documents/cleanup (cleanup endpoint)
     * - /api/documents/from-email (email webhook endpoint)
     * - /api/documents/migrate-from-drive (one-time migration endpoint)
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico
     */
    "/((?!login|api/auth|api/test-snowflake|api/documents/reset-schema|api/documents/cleanup|api/documents/from-email|api/documents/migrate-schema|api/documents/migrate-from-drive|_next/static|_next/image|favicon.ico).*)",
  ],
};
