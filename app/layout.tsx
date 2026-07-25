import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your Private Digital Wardrobe",
  description:
    "Plan outfits visually without changing clothes ten times. Everything stays on your device."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
