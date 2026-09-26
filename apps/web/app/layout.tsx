import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { DISCLAIMER, OFFICIAL_SITE, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: "%s | Mysore Palace Guide" },
  description:
    "An independent visitor guide to Mysore Palace: visiting hours, Mysuru Dasara, the history of the Wadiyar dynasty, and heritage news.",
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_IN" },
  alternates: { types: { "application/rss+xml": `${SITE_URL}/news/feed.xml` } },
};

const navLink = "text-gold-light/90 hover:text-gold-light hover:underline underline-offset-4";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cormorant.variable}>
      <body className="min-h-screen font-serif antialiased">
        <div role="note" className="bg-silk-deep px-4 py-2 text-center text-sm text-gold-light">
          {DISCLAIMER} Official site:{" "}
          <a href={OFFICIAL_SITE} className="underline" rel="noopener">
            mysorepalace.gov.in
          </a>
        </div>
        <div className="zari-rule" />

        <header>
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 font-display text-lg font-semibold">
            <Link href="/" className="zari-text w-full text-3xl font-bold tracking-wide sm:mr-auto sm:w-auto">
              Mysore Palace Guide
            </Link>
            <Link href="/#visit" className={navLink}>Visit</Link>
            <Link href="/#dasara" className={navLink}>Dasara</Link>
            <Link href="/#history" className={navLink}>History</Link>
            <Link href="/news" className={navLink}>News</Link>
          </nav>
        </header>
        <div className="zari-border" aria-hidden />

        <main className="mx-auto max-w-5xl px-3 py-10 sm:px-6">
          <div className="pallu px-6 py-8 sm:px-12 sm:py-12">{children}</div>
        </main>

        <div className="zari-border bottom" aria-hidden />
        <footer className="bg-silk-deep/70">
          <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-parchment/80">
            <p>
              {DISCLAIMER} For official information visit{" "}
              <a href={OFFICIAL_SITE} className="text-gold-light underline">mysorepalace.gov.in</a>.
            </p>
            <p className="mt-2">
              News briefs are original summaries reviewed by an editor; every brief links to its sources.{" "}
              <Link href="/news/feed.xml" className="text-gold-light underline">RSS</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
