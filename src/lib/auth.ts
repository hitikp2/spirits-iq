import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as any,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12 hours
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // Standard email/password login
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          include: { store: true },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          storeName: user.store.name,
        };
      },
    }),
    // Quick PIN login for POS cashiers
    CredentialsProvider({
      id: "pin",
      name: "POS PIN Login",
      credentials: {
        pin: { label: "PIN", type: "password" },
        storeId: { label: "Store ID", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.pin || !credentials?.storeId) return null;

        const user = await db.user.findFirst({
          where: {
            storeId: credentials.storeId,
            pin: credentials.pin,
          },
          include: { store: true },
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          storeName: user.store.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.storeId = (user as any).storeId;
        token.storeName = (user as any).storeName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).storeId = token.storeId;
        (session.user as any).storeName = token.storeName;
      }
      return session;
    },
  },
};
