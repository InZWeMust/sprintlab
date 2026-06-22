import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprint Lab",
  description: "Biomechanics analysis for sprinters",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Sprint Lab" },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#f0f0f0", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
