import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
  title: "QA-Craft | AI-Powered Test Management",
  description: "AI-Powered Test Management & Refinement Engine for QA Engineers",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <QueryProvider>
          <DashboardLayout>
            {children}
          </DashboardLayout>
        </QueryProvider>
      </body>
    </html>
  );
}
