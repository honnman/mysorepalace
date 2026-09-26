export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mysorepalace.com").replace(/\/$/, "");
export const SITE_NAME = "Mysore Palace — Independent Visitor Guide";
export const DISCLAIMER =
  "Independent guide — not affiliated with the Mysore Palace Board or Government of Karnataka.";
export const OFFICIAL_SITE = "https://mysorepalace.gov.in";

export const CATEGORY_LABELS: Record<string, string> = {
  palace: "Palace",
  royal_family: "Royal Family",
  heritage: "Heritage",
  dasara: "Dasara",
  city: "Mysuru",
  reject: "Rejected",
};
