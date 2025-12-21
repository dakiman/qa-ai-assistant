import type { Metadata } from "next";
import "./globals.css";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export const metadata: Metadata = {
  title: "QA-Craft | AI-Powered Test Management",
  description: "AI-Powered Test Management & Refinement Engine for QA Engineers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <DashboardLayout>
          {children}
        </DashboardLayout>
      </body>
    </html>
  );
}
