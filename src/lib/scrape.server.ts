import { z } from "zod";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
import { aiChatCompletion, getAiConfig } from "./ai.server";

export interface ScrapedSiteData {
  business_name: string | null;
  logo_url: string | null;
  phone: string | null;
  palette: {
    primary?: string;
    secondary?: string;
    accent?: string;
    bg?: string;
    text?: string;
  };
  products: Array<{
    name: string;
    price: number | null;
    image_url: string | null;
    description: string | null;
  }>;
  categories: string[];
}

const ExtractionSchema = z.object({
  business_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  products: z
    .array(
      z.object({
        name: z.string(),
        price: z.union([z.number(), z.string(), z.null()]).optional(),
        image_url: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .max(60)
    .optional(),
  categories: z.array(z.string().min(1).max(80)).max(20).optional(),
});

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeIlPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

/** Extract a plausible Israeli phone from raw markdown. */
function extractPhoneFromMarkdown(md: string): string | null {
  if (!md) return null;
  const tel = md.match(/tel:\+?([\d\s\-().]{7,})/i);
  if (tel?.[1]) {
    const n = normalizeIlPhone(tel[1]);
    if (n.length >= 9) return n;
  }
  const generic = md.match(
    /(?:\+?972[-\s]?|0)(?:[23489]|5\d|7[2-9])[-\s]?\d{3}[-\s]?\d{4}/,
  );
  if (generic?.[0]) return normalizeIlPhone(generic[0]);
  return null;
}

/** Call Firecrawl v2 scrape — returns markdown + branding metadata. */
async function firecrawlScrape(url: string, apiKey: string): Promise<{
  markdown: string;
  branding?: {
    logo?: string;
    colors?: Record<string, string>;
    images?: { logo?: string; favicon?: string };
  };
  metadata?: { title?: string; description?: string };
}> {
  const res = await fetch(FIRECRAWL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "branding"],
      onlyMainContent: false,
      waitFor: 1500,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`firecrawl_${res.status}:${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const data = (json.data ?? json) as Record<string, unknown>;
  return {
    markdown: String(data.markdown ?? ""),
    branding: data.branding as ScrapedSiteData["palette"] extends infer _ ? any : never,
    metadata: data.metadata as { title?: string; description?: string } | undefined,
  };
}

/** Ask the AI provider to extract structured site data from markdown. */
async function extractWithAI(
  markdown: string,
  hintTitle: string,
): Promise<{ business_name: string | null; phone: string | null; products: ScrapedSiteData["products"]; categories: string[] }> {
  const trimmed = markdown.length > 18000 ? markdown.slice(0, 18000) : markdown;
  const prompt = `אתה מחלץ נתוני חנות פרחים מתוכן אתר. החזר JSON תקני בלבד עם המבנה:
{
  "business_name": string | null,
  "phone": string | null,
  "products": [{ "name": string, "price": number | null, "image_url": string | null, "description": string | null }],
  "categories": string[]
}
- שמות מוצרים בעברית אם האתר בעברית.
- מחיר במספרים בלבד (ש"ח), בלי סימני מטבע.
- phone: מספר טלפון של בית העסק (כפי שמופיע באתר), עדיף בפורמט ישראלי 05XXXXXXXX. אם אין — null.
- image_url רק אם קיים URL מלא של תמונה במקור.
- מקסימום 24 מוצרים, מקסימום 8 קטגוריות.
- אם אין מידע, החזר מערך ריק / null.
כותרת אתר רמז: ${hintTitle || "(ללא)"}

תוכן האתר (Markdown):
${trimmed}`;

  const res = await aiChatCompletion(
    [
      { role: "system", content: "You are a precise data extraction assistant. Always respond with valid JSON only." },
      { role: "user", content: prompt },
    ],
    { json: true },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ai_extract_${res.status}:${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`ai_extract_parse: ${String(raw).slice(0, 200)}`);
  }
  const safe = ExtractionSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error(`ai_extract_schema: ${safe.error.message.slice(0, 200)}`);
  }
  const products = (safe.data.products ?? []).map((p) => ({
    name: String(p.name).trim().slice(0, 200),
    price: coerceNumber(p.price),
    image_url: p.image_url && /^https?:\/\//i.test(p.image_url) ? p.image_url : null,
    description: p.description ? String(p.description).slice(0, 500) : null,
  })).filter((p) => p.name.length > 0);
  return {
    business_name: safe.data.business_name?.trim() || null,
    phone: safe.data.phone ? normalizeIlPhone(safe.data.phone) : null,
    products,
    categories: (safe.data.categories ?? []).map((c) => c.trim()).filter(Boolean),
  };
}

/** End-to-end: scrape URL → extract via AI → return structured data. */
export async function scrapeAndExtract(url: string): Promise<ScrapedSiteData> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) throw new Error("missing_FIRECRAWL_API_KEY");
  if (!getAiConfig()) throw new Error("missing_AI_API_KEY");

  const scraped = await firecrawlScrape(url, firecrawlKey);
  if (!scraped.markdown || scraped.markdown.length < 50) {
    throw new Error("scrape_empty");
  }

  const extracted = await extractWithAI(
    scraped.markdown,
    scraped.metadata?.title ?? "",
  );

  const branding = (scraped.branding ?? {}) as {
    logo?: string;
    colors?: Record<string, string>;
    images?: { logo?: string; favicon?: string };
  };
  const colors = branding.colors ?? {};
  const phone =
    extracted.phone || extractPhoneFromMarkdown(scraped.markdown) || null;
  return {
    business_name: extracted.business_name,
    logo_url:
      branding.images?.logo ||
      branding.logo ||
      null,
    phone,
    palette: {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      bg: colors.background,
      text: colors.textPrimary,
    },
    products: extracted.products,
    categories: extracted.categories,
  };
}
