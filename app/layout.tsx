import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TPA Pulse",
  description: "Track TPA services and operational readiness",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
