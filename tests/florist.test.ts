import { describe, expect, it } from "vitest";
import {
  buildPrepList,
  cleanPOItems,
  dueAt,
  formatPurchaseOrderMessage,
  NEXT_STEP,
  poTotal,
  toWhatsAppNumber,
  tomorrowISO,
  whatsappLink,
} from "@/lib/florist";

describe("florist helpers", () => {
  it("normalizes Israeli phones for WhatsApp", () => {
    expect(toWhatsAppNumber("050-123-4567")).toBe("972501234567");
    expect(toWhatsAppNumber("+972 50 123 4567")).toBe("972501234567");
    expect(toWhatsAppNumber("00972501234567")).toBe("972501234567");
    expect(toWhatsAppNumber("123")).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
  });

  it("builds a wa.me link with encoded text", () => {
    expect(whatsappLink("0501234567", "שלום רב")).toBe(
      "https://wa.me/972501234567?text=" + encodeURIComponent("שלום רב"),
    );
    expect(whatsappLink(null, "x")).toBeNull();
  });

  it("sums the prep list by product, biggest first", () => {
    expect(
      buildPrepList([
        { product_name: "זר ורדים", quantity: 2 },
        { product_name: "זר ורדים ", quantity: 1 },
        { product_name: "סחלב", quantity: 1 },
        { product_name: "", quantity: 5 },
        { product_name: "ריק", quantity: 0 },
      ]),
    ).toEqual([
      { name: "זר ורדים", qty: 3 },
      { name: "סחלב", qty: 1 },
    ]);
  });

  it("cleans purchase-order lines and totals priced lines only", () => {
    const items = [
      { name: " ורדים אדומים ", qty: 50, unit: "גבעולים", price: 2.5 },
      { name: "סרט סאטן", qty: 2, unit: "יח׳", price: null },
      { name: "", qty: 3, unit: "יח׳" },
      { name: "אפס", qty: 0, unit: "יח׳" },
    ];
    expect(cleanPOItems(items).map((i) => i.name)).toEqual(["ורדים אדומים", "סרט סאטן"]);
    expect(poTotal(items)).toBe(125);
  });

  it("formats the supplier WhatsApp message", () => {
    const msg = formatPurchaseOrderMessage({
      storeName: "פרחי מורן",
      supplierName: "אבי",
      neededBy: "2026-11-23",
      items: [{ name: "ורדים", qty: 50, unit: "גבעולים" }],
      notes: "לפני 8 בבוקר",
    });
    expect(msg).toContain("שלום אבי, הזמנה חדשה מפרחי מורן");
    expect(msg).toContain("לתאריך: 23/11/2026");
    expect(msg).toContain("• ורדים: 50 גבעולים");
    expect(msg).toContain("הערות: לפני 8 בבוקר");
  });

  it("walks an order through its steps and stops at delivered", () => {
    expect(NEXT_STEP.pending?.to).toBe("confirmed");
    expect(NEXT_STEP.out_for_delivery?.to).toBe("delivered");
    expect(NEXT_STEP.delivered).toBeUndefined();
    expect(NEXT_STEP.cancelled).toBeUndefined();
  });

  it("uses the delivery time when set, else the order time", () => {
    expect(
      dueAt({
        scheduled_for: "2026-11-23T10:00:00Z",
        created_at: "2026-11-20T10:00:00Z",
      }).toISOString(),
    ).toBe("2026-11-23T10:00:00.000Z");
    expect(dueAt({ scheduled_for: null, created_at: "2026-11-20T10:00:00Z" }).toISOString()).toBe(
      "2026-11-20T10:00:00.000Z",
    );
  });

  it("gives tomorrow as yyyy-mm-dd", () => {
    expect(tomorrowISO(new Date(2026, 11, 31, 15))).toBe("2027-01-01");
  });
});
