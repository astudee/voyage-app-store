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
     * - /api/documents-v2/reset-schema (schema reset endpoint)
     * - /api/documents-v2/cleanup (cleanup endpoint)
     * - /api/documents-v2/from-email (email webhook endpoint)
     * - /api/documents-v2/migrate-from-drive (one-time migration endpoint)
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico
     */
    "/((?!login|api/auth|api/test-snowflake|api/documents-v2/reset-schema|api/documents-v2/cleanup|api/documents-v2/from-email|api/documents-v2/migrate-schema|api/documents-v2/migrate-from-drive|_next/static|_next/image|favicon.ico).*)",
  ],
};
