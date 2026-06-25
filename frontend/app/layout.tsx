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
  title: "i.AI Hackathon",
  description: "Full-stack hackathon scaffold.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
