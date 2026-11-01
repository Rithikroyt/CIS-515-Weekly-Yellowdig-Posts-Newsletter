import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CIS 515 Yellowdig Weekly Posts Newsletter",
  description: "Generate a newsletter from the weekly CIS 515 Yellowdig workflow discussions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
