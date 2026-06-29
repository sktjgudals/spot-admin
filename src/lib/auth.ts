import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AdminRole } from "@/generated/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // 동적 임포트로 Edge 번들에서 제외
        const { prisma } = await import("@/lib/prisma");
        const bcrypt = await import("bcryptjs");

        const account = await prisma.adminAccount.findUnique({
          where: { email: credentials.email as string },
          include: { business: true },
        });

        if (!account || !account.isActive) return null;

        const valid = await bcrypt.default.compare(
          credentials.password as string,
          account.passwordHash
        );
        if (!valid) return null;

        return {
          id: account.id,
          email: account.email,
          name: account.name,
          role: account.role,
          businessId: account.businessId ?? undefined,
          businessName: account.business?.name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: AdminRole }).role;
        token.businessId = (user as { businessId?: string }).businessId;
        token.businessName = (user as { businessName?: string }).businessName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as AdminRole;
        session.user.businessId = token.businessId as string | undefined;
        session.user.businessName = token.businessName as string | undefined;
      }
      return session;
    },
  },
});
