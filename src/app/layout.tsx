import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "@/components/providers/query-provider";
import { AdminAuthProvider } from "@/auth/provider/AdminAuthProvider";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

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
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground" suppressHydrationWarning>
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
