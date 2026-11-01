"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "./Illustrations";

const LINKS = [
  { href: "/issues/4", label: "Issues", match: "/issues" },
  { href: "/explore", label: "Explore", match: "/explore" },
  { href: "/atlas", label: "Atlas", match: "/atlas" },
  { href: "/trends", label: "Trends", match: "/trends" },
  { href: "/methodology", label: "Methodology", match: "/methodology" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? null); }, []);
  const next = () => {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (sysDark ? "dark" : "light");
    const value = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem("obs-theme", value); } catch { /* storage unavailable: theme lasts this visit only */ }
    setTheme(value);
  };
  return (
    <button type="button" className="icon-btn" onClick={next} aria-label="Switch between light and dark theme">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand" aria-label="CIS 515 Workflow Observatory home">
          <BrandMark />
          <span className="brand-text"><b>Workflow Observatory</b><span>CIS 515 · Community Dispatch</span></span>
        </Link>
        <nav aria-label="Main">
          <div className="nav" id="main-nav" data-open={open}>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.match) ? "page" : undefined}>{l.label}</Link>
            ))}
          </div>
        </nav>
        <ThemeToggle />
        <button type="button" className="icon-btn menu-toggle" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>
          <span className="sr-only">Menu</span>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
    </header>
  );
}
