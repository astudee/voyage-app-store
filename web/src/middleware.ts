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
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
