import type { Metadata } from "next";
import Link from "next/link";
import { DISCLAIMER, OFFICIAL_SITE, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: "%s | Mysore Palace Guide" },
  description:
    "An independent visitor guide to Mysore Palace: visiting hours, Mysuru Dasara, the history of the Wadiyar dynasty, and heritage news.",
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_IN" },
  alternates: { types: { "application/rss+xml": `${SITE_URL}/news/feed.xml` } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-serif antialiased">
        <div role="note" className="bg-maroon px-4 py-2 text-center text-sm text-white">
          {DISCLAIMER} Official site:{" "}
          <a href={OFFICIAL_SITE} className="underline" rel="noopener">
            mysorepalace.gov.in
          </a>
        </div>
        <header className="border-b border-gold/30">
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
            <Link href="/" className="w-full text-xl font-bold sm:mr-auto sm:w-auto">
              Mysore Palace Guide
            </Link>
            <Link href="/#visit">Visit</Link>
            <Link href="/#dasara">Dasara</Link>
            <Link href="/#history">History</Link>
            <Link href="/news">News</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-4xl border-t border-gold/30 px-4 py-6 text-sm text-ink/70">
          <p>
            {DISCLAIMER} For official information visit <a href={OFFICIAL_SITE} className="underline">mysorepalace.gov.in</a>.
          </p>
          <p className="mt-2">
            News briefs are original summaries reviewed by an editor; every brief links to its sources.{" "}
            <Link href="/news/feed.xml" className="underline">RSS</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
