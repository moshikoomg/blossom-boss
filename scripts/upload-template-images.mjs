import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TPL = "11111111-1111-1111-1111-111111111111";
const DIR = "/tmp/tplimg";

const map = {
  "boker-nordi":         { kind: "product", id: "277c0212-b1be-4d45-bcfc-dff877a86997" },
  "fantasia-bohemit":    { kind: "product", id: "60a2e0e3-0ff1-4ef8-a683-96f5ef5ddff4" },
  "bustan-avivi":        { kind: "product", id: "a66a33cf-75d4-4a13-be5d-a9559e8f0177" },
  "shkia-toskanit":      { kind: "product", id: "74710337-c3d4-475e-a638-ad6479e3f660" },
  "zrichat-hachama":     { kind: "product", id: "4be55080-c7b5-43c6-ab86-c960e3be1f50" },
  "negiat-pere":         { kind: "product", id: "8bb5decf-4a98-41db-9bee-ff8416c142c0" },
  "minimalism-yapani":   { kind: "product", id: "225457b1-60ee-4217-90be-d3709dfe7a41" },
  "elegantiut-urbanit":  { kind: "product", id: "6fd9c343-ca8b-4882-874a-391f1aa33fbc" },
  "zahav-malkuti":       { kind: "product", id: "d1a6a355-4499-4719-aa81-5c691916c069" },
  "leylot-casablanca":   { kind: "product", id: "c9d05608-dba4-4147-b955-d7d5de62dab4" },
  "romantica-parizait":  { kind: "product", id: "970b1a2b-8fd4-4ac3-8dc6-0e924016546f" },
  "addon-chocolates":    { kind: "addon",   id: "cafdc848-2a11-405e-a95f-ad286ac0af9a" },
  "addon-candle":        { kind: "addon",   id: "e5902506-b8bc-4983-bfe8-b816002c58fa" },
  "addon-balloon-love":  { kind: "addon",   id: "0518ded9-3229-4c73-9893-234b2231cd4d" },
  "addon-sweets-basket": { kind: "addon",   id: "5bd60432-7923-46cb-bb60-52c95c0254bd" },
  "addon-luxury-card":   { kind: "addon",   id: "7e85808b-2e35-4307-a5a2-14297d32c3fc" },
  "addon-wine-set":      { kind: "addon",   id: "0daeefaf-1420-4ed6-86f8-1a09260665a9" },
};

const PUBLIC_BASE = `${process.env.SUPABASE_URL}/storage/v1/object/public/product-images/`;

const urlFor = (slug) => `${PUBLIC_BASE}template/${slug}.webp`;

async function uploadAll() {
  for (const [slug, info] of Object.entries(map)) {
    const buf = await fs.readFile(path.join(DIR, `${slug}.webp`));
    const objectPath = `template/${slug}.webp`;
    const { error } = await sb.storage.from("product-images").upload(objectPath, buf, {
      contentType: "image/webp", upsert: true, cacheControl: "31536000",
    });
    if (error) throw new Error(`upload ${slug}: ${error.message}`);
    console.log("uploaded", objectPath);
  }
}

async function syncDb() {
  for (const [slug, info] of Object.entries(map)) {
    const url = urlFor(slug);
    if (info.kind === "product") {
      let { error } = await sb.from("products").update({ image_url: url })
        .eq("id", info.id).eq("store_id", TPL);
      if (error) throw new Error(`products ${slug}: ${error.message}`);
      // Replace gallery rows with single primary
      await sb.from("product_images").delete().eq("product_id", info.id);
      ({ error } = await sb.from("product_images").insert({
        product_id: info.id, image_url: url, display_order: 0,
      }));
      if (error) throw new Error(`product_images ${slug}: ${error.message}`);
    } else {
      const { error } = await sb.from("add_ons").update({ image_url: url })
        .eq("id", info.id).eq("store_id", TPL);
      if (error) throw new Error(`add_ons ${slug}: ${error.message}`);
    }
    console.log("synced", slug, "=>", url);
  }
}

await uploadAll();
await syncDb();
console.log("DONE");
