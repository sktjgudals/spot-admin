import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "@/components/providers/query-provider";
import { AdminAuthProvider } from "@/auth/provider/AdminAuthProvider";

export const metadata: Metadata = {
  title: "Dopa Admin",
  description: "Dopa 관리자 페이지",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <QueryProvider>
          <AdminAuthProvider>
            {children}
            <Toaster richColors />
          </AdminAuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
