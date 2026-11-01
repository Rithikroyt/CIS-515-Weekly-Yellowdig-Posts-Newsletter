import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], display: "swap" });
const sans = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "CIS 515 Workflow Observatory", template: "%s · CIS 515 Workflow Observatory" },
  description: "See what the class built, what failed, and what to carry forward. Weekly CIS 515 workflow experiments become a reviewed class-wide dashboard and the CIS 515 Community Dispatch.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

// Applies a saved theme before paint. Reads only this site's own localStorage key.
const THEME_SCRIPT = "try{var t=localStorage.getItem('obs-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={serif.variable + " " + sans.variable + " " + mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteHeader />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container cols">
            <div>
              <p><strong>CIS 515 Workflow Observatory</strong> — CIS 515: AI and Data Analytics Strategy, Fall B 2026.</p>
              <p>Numbers are counted by code, prose is drafted by AI with checked evidence, and a person approves every issue. A student project; not an official Arizona State University publication.</p>
            </div>
            <div>
              <p><strong>Read</strong></p>
              <p><Link href="/issues/4">Week 4 issue</Link><br /><Link href="/explore">All builds</Link><br /><Link href="/atlas">Workflow Atlas</Link></p>
            </div>
            <div>
              <p><strong>Trust</strong></p>
              <p><Link href="/methodology">Methodology</Link><br /><Link href="/trends">Trends</Link><br /><a href="https://github.com/Rithikroyt/CIS-515-Weekly-Yellowdig-Posts-Newsletter">Source code</a></p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
