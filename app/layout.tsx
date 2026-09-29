import type { Metadata } from "next";
import { Inter, Pacifico } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const pacifico = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });

export const metadata: Metadata = {
  title: "Raha TPA Tracker",
  description: "Track TPA services and operational readiness",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${pacifico.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
