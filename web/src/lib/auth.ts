import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// Parse users from environment variable
function getUsers(): Map<string, string> {
  const users = new Map<string, string>();
  const authUsers = process.env.AUTH_USERS || "";

  authUsers.split(",").forEach((userPair) => {
    const [username, password] = userPair.split(":");
    if (username && password) {
      users.set(username.trim(), password.trim());
    }
  });

  return users;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const users = getUsers();
        const storedPassword = users.get(credentials.username);

        if (storedPassword && storedPassword === credentials.password) {
          return {
            id: credentials.username,
            name: credentials.username,
            email: `${credentials.username}@voyage.com`,
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
