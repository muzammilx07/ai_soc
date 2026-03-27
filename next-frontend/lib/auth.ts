import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

const hasGoogleCredentials =
  Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);

const demoUsername = process.env.DEMO_USERNAME || "analyst";
const demoPassword = process.env.DEMO_PASSWORD || "analyst123";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(hasGoogleCredentials
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Demo Access",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        if (
          credentials.username === demoUsername &&
          credentials.password === demoPassword
        ) {
          return {
            id: "demo-analyst",
            name: "SOC Analyst",
            email: "analyst@local.dev",
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
        session.user.email = token.email;
      }
      return session;
    },
  },
};
