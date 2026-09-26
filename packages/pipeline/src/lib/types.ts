export const CATEGORIES = ["palace", "royal_family", "heritage", "dasara", "city", "reject"] as const;
export type Category = (typeof CATEGORIES)[number];

export type SourceType = "rss" | "gnews" | "manual";

export interface Source {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  language: string;
  active: boolean;
}

export interface RawItem {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  url: string;
  published_at: string | null;
  snippet: string | null;
  fetched_at: string;
  hash: string;
  publisher: string | null;
  category: Category | null;
  relevance: number | null;
  reason: string | null;
  classified_at: string | null;
  cluster_key: string | null;
}

export const RELEVANCE_THRESHOLD = 0.6;
