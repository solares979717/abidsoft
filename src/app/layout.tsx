import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { RegisterSW } from "@/components/shell/RegisterSW";

export const metadata: Metadata = {
  title: "Shafiq Medical & Diagnostic Center",
  description: "Clinic management system",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Shafiq Clinic", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1656A6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
