import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Familjen_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

const display = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-familjen",
  display: "swap",
});

const body = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Marginalia",
    template: "%s · Marginalia",
  },
  description:
    "Marginalia turns the QR code on a government letter into a thirty-second conversation that explains it — in any language — and catches the mistake.",
  applicationName: "Marginalia",
  openGraph: {
    title: "Marginalia",
    description:
      "The voice in the margin of your government letter — explained in thirty seconds, in any language.",
    siteName: "Marginalia",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
