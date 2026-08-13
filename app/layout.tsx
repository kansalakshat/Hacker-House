import type { Metadata, Viewport } from "next";
import { Imbue, Victor_Mono } from "next/font/google";
import "./globals.css";

const imbue = Imbue({
  subsets: ["latin"],
  variable: "--font-imbue",
  display: "swap",
});

const victor = Victor_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-victor",
  display: "swap",
});

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

const title = "HH Goa 2026 Frame & Builder Pass";
const description =
  "Drop a photo, get an on-brand Hacker House Goa 2026 profile frame or builder pass. Download it and post it in seconds.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "HH Goa 2026",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 675, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B6839",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${imbue.variable} ${victor.variable}`}>
      <body className="min-h-[100dvh] bg-ink text-cream">{children}</body>
    </html>
  );
}
