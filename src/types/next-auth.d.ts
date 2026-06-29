import { AdminRole } from "@/generated/prisma";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: AdminRole;
      businessId?: string;
      businessName?: string;
    };
  }
}
