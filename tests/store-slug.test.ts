import { describe, expect, it } from "vitest";
import { createLatinSlug, isValidSlug } from "@/lib/store-slug";

describe("store slug (/s/<slug>)", () => {
  it("transliterates Hebrew names", () => {
    expect(createLatinSlug("פרחי שושנה")).toBe("prchy-shvshnh");
  });
  it("keeps latin names readable", () => {
    expect(createLatinSlug("  Rose & Lily Flowers! ")).toBe("rose-lily-flowers");
  });
  it("falls back for short / reserved / non-latin names", () => {
    expect(createLatinSlug("א", "abc123")).toBe("shop-abc123");
    expect(createLatinSlug("admin", "abc123")).toBe("shop-abc123");
    expect(createLatinSlug("🌸🌸", "abc123")).toBe("shop-abc123");
  });
  it("caps length at 40 without trailing dash", () => {
    const s = createLatinSlug("a".repeat(39) + " bbbb");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
  it("validates", () => {
    expect(isValidSlug("my-shop")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("My-Shop")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("api")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
  });
});
