import { describe, expect, it } from "vitest";
import { clusterItems, jaccard, titleTokens, type ClusterInput } from "../src/cluster.js";

const item = (id: string, title: string, hoursFromStart: number, cluster_key: string | null = null): ClusterInput => {
  const t = new Date(Date.UTC(2026, 8, 20) + hoursFromStart * 3600_000).toISOString();
  return { id, title, published_at: t, fetched_at: t, cluster_key };
};

describe("titleTokens", () => {
  it("drops stopwords and unifies spelling variants", () => {
    const a = titleTokens("Dussehra elephants arrive at the Mysore Palace");
    const b = titleTokens("Dasara elephant arrives at Mysuru palace");
    expect(a.has("the")).toBe(false);
    expect(a.has("mysuru")).toBe(true);
    expect(a.has("dasara")).toBe(true);
    expect(jaccard(a, b)).toBeGreaterThan(0.6);
  });
});

describe("clusterItems", () => {
  it("groups same-story headlines within 48h and separates different stories", () => {
    const items = [
      item("a", "Dasara elephants arrive at Mysore Palace for Jamboo Savari rehearsals", 0),
      item("b", "Dasara elephants reach Mysuru Palace, rehearsals for Jamboo Savari to begin", 4),
      item("c", "Palace illumination timings extended for Dasara fortnight", 5),
      item("d", "Yaduveer Wadiyar to hold private durbar at palace during Navaratri", 30),
    ];
    const keys = clusterItems(items);
    expect(keys.get("a")).toBe(keys.get("b"));
    expect(keys.get("c")).not.toBe(keys.get("a"));
    expect(keys.get("d")).not.toBe(keys.get("a"));
    expect(new Set(keys.values()).size).toBe(3);
  });

  it("does not join similar headlines more than 48h apart", () => {
    const items = [
      item("a", "Mysore Palace illumination timings extended", 0),
      item("b", "Mysore Palace illumination timings extended again", 60),
    ];
    const keys = clusterItems(items);
    expect(keys.get("a")).not.toBe(keys.get("b"));
  });

  it("is deterministic and reuses an existing cluster_key for new members", () => {
    const items = [
      item("old", "Dasara elephants arrive at Mysore Palace", 0, "c_existing"),
      item("new", "Dasara elephants arrive at Mysuru Palace for rehearsals", 10),
    ];
    const keys = clusterItems(items);
    expect(keys.get("new")).toBe("c_existing");
    expect(clusterItems([...items].reverse())).toEqual(keys);
  });

  it("never merges two different existing clusters", () => {
    const items = [
      item("x", "Mysore Palace illumination timings extended", 0, "c_one"),
      item("y", "Mysore Palace illumination timings extended", 1, "c_two"),
    ];
    const keys = clusterItems(items);
    expect(keys.get("x")).toBe("c_one");
    expect(keys.get("y")).toBe("c_two");
  });
});
