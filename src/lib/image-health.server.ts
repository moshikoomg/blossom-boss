import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server-only helpers for detecting broken product image URLs.
 *
 * A URL is considered "broken" when:
 *   - it is empty / null
 *   - it is an SVG placeholder data: URL
 *   - it points to a /product-images/<name> object that no longer exists
 *     in Supabase Storage (file was deleted but the DB row still references it).
 *
 * Used by the template-clone, seed and backfill flows so a missing template
 * image never propagates as a broken `<img>` into customer stores.
 */

const BUCKET = "product-images";

export function extractStorageObjectName(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}

/**
 * Returns the set of storage object names (from the given URLs) that DO exist
 * in the product-images bucket. URLs that don't point to that bucket are
 * ignored (caller decides how to treat them).
 */
export async function existingStorageObjects(urls: (string | null | undefined)[]): Promise<Set<string>> {
  const names = Array.from(
    new Set(
      urls.map(extractStorageObjectName).filter((n): n is string => !!n),
    ),
  );
  if (!names.length) return new Set();
  const { data } = await supabaseAdmin
    .schema("storage" as any)
    .from("objects")
    .select("name")
    .eq("bucket_id", BUCKET)
    .in("name", names);
  return new Set((data ?? []).map((r: any) => r.name as string));
}

export function isLikelyBrokenImage(url: string | null | undefined): boolean {
  if (!url) return true;
  if (url.trim() === "") return true;
  if (url.startsWith("data:image/svg+xml")) return true;
  return false;
}

/**
 * Best-effort liveness check for an image URL. Returns false for empty /
 * placeholder URLs and for URLs whose storage object is known to be missing
 * from the product-images bucket. For external (non-bucket) URLs we issue
 * a short HEAD request and treat network failures / non-2xx as "broken".
 *
 * `existing` is the prefetched Set returned by `existingStorageObjects()` —
 * pass it when validating many URLs at once to avoid one storage round-trip
 * per URL.
 */
export async function verifyImageUrl(
  url: string | null | undefined,
  existing?: Set<string>,
): Promise<boolean> {
  if (isLikelyBrokenImage(url)) return false;
  const name = extractStorageObjectName(url);
  if (name) {
    const set = existing ?? (await existingStorageObjects([url!]));
    return set.has(name);
  }
  // External URL — quick HEAD ping with a tight timeout.
  try {
    const res = await fetch(url!, {
      method: "HEAD",
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Decide the best primary image URL given the template's image_url and a
 * pre-loaded set of gallery URLs (display_order ascending). Falls back to
 * the first reachable gallery image when the template image is empty/broken
 * or its storage object is missing.
 */
export function pickPrimaryImage(
  templateUrl: string | null | undefined,
  galleryUrls: string[],
  existing: Set<string>,
): string | null {
  // Trust any non-empty, non-placeholder URL string as-is. The previous
  // implementation tried to verify that storage objects still existed via
  // the PostgREST `storage` schema, but that schema is not exposed to the
  // service-role client over PostgREST, so the existence set was always
  // empty and every product got an empty image_url. The template URL is
  // the source of truth — copy it verbatim.
  const urlOk = (u: string | null | undefined): u is string =>
    typeof u === "string" && u.trim() !== "" && !u.startsWith("data:image/svg+xml");
  if (urlOk(templateUrl)) return templateUrl;
  for (const g of galleryUrls) {
    if (urlOk(g)) return g;
  }
  return null;
}
