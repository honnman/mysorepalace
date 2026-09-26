import Link from "next/link";
import { listPublished } from "@/lib/stories";
import { StoryCard } from "./StoryCard";

export const revalidate = 600;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 py-8">
      <h2 className="mango mb-3 font-display text-3xl font-bold text-accent">{title}</h2>
      {children}
    </section>
  );
}

export default async function Home() {
  const latest = await listPublished(3).catch(() => []);
  return (
    <>
      <div className="py-6">
        <h1 className="font-display text-5xl font-bold leading-tight text-silk">Mysore Palace, independently explained</h1>
        <p className="mt-3 text-lg text-ink/80">
          Practical visiting advice, the story of the Wadiyar dynasty, a guide to Mysuru Dasara, and a
          reviewed round-up of heritage news.
        </p>
        <div className="zari-rule mt-8 w-40" />
      </div>

      <Section id="visit" title="Visit">
        <p className="text-ink/80">
          Placeholder: opening hours, tickets, the evening illumination, getting there, accessibility and
          photography rules. Always confirm timings on the official site before you travel.
        </p>
      </Section>

      <Section id="dasara" title="Dasara">
        <p className="text-ink/80">
          Placeholder: the ten days of Nada Habba, the Jamboo Savari procession, the torchlight parade, and
          how to plan a Dasara visit.
        </p>
      </Section>

      <Section id="history" title="History">
        <p className="text-ink/80">
          Placeholder: the Wadiyar dynasty, the 1897 fire and the Indo-Saracenic palace designed by Henry
          Irwin, and the palace&apos;s halls and collections.
        </p>
      </Section>

      <Section id="news" title="News">
        {latest.length ? (
          latest.map((s) => <StoryCard key={s.id} story={s} />)
        ) : (
          <p className="text-ink/60">No stories published yet.</p>
        )}
        <Link href="/news" className="mt-4 inline-block font-display text-lg font-semibold text-accent underline">
          All news →
        </Link>
      </Section>
    </>
  );
}
