import type { MetadataRoute } from "next";
import { listPublished } from "@/lib/stories";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await listPublished(1000).catch(() => []);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.8 },
    ...stories.map((s) => ({
      url: `${SITE_URL}/news/${s.slug}`,
      lastModified: s.published_at ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
