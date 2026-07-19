import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Chakra Petch — squared, technical, broadcast-scoreboard energy (display + data).
const display = Chakra_Petch({
  subsets: ["latin"],
  variable: "--font-chakra",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Sora — geometric, modern, highly legible body.
const sans = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Foresight — feel the goal coming before the market does",
  description:
    "The trading-desk sixth sense, for every fan. Foresight turns TxLINE live odds + pitch events into a glowing gauge that lights up the instant a goal is brewing — verified on Solana.",
  applicationName: "Foresight",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Foresight" },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
