// Sample flowers shown on a brand-new store so it never looks empty.
// They live only in the browser: never written to the database, never
// orderable, and they disappear on their own as soon as the store has
// one real product.

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=600&q=70&auto=format&fit=crop`;

export const DEMO_CATEGORIES = [
  { id: "demo-cat-bouquets", name: "זרים" },
  { id: "demo-cat-roses", name: "ורדים" },
  { id: "demo-cat-plants", name: "עציצים" },
  { id: "demo-cat-gifts", name: "מתנות" },
] as const;

type DemoProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  image_url: string;
  badge: string | null;
  category_id: string;
};

const P = (
  n: number,
  name: string,
  price: number,
  photo: string,
  cat: string,
  extra: Partial<DemoProduct> = {},
): DemoProduct => ({
  id: `demo-${n}`,
  name,
  description: "",
  price,
  original_price: null,
  image_url: img(photo),
  badge: null,
  category_id: cat,
  ...extra,
});

// Each name matches what its photo really shows (checked one by one).
export const DEMO_PRODUCTS: DemoProduct[] = [
  P(1, "זר שדה פסטלי", 189, "1487530811176-3780de880c2d", "demo-cat-bouquets", {
    badge: "הכי נמכר",
  }),
  P(2, "ורדים אדומים", 229, "1494972308805-463bc619d34e", "demo-cat-roses"),
  P(3, "זר טוליפים ורודים", 159, "1561181286-d3fee7d55364", "demo-cat-bouquets"),
  P(4, "זר חמניות", 169, "1455659817273-f96807779a8a", "demo-cat-bouquets"),
  P(5, "אנתוריום בעציץ", 149, "1567748157439-651aca2ff064", "demo-cat-plants"),
  P(6, "ורדים בצבעי הקשת", 249, "1508610048659-a06b669e3321", "demo-cat-roses", {
    original_price: 279,
  }),
  P(7, "זר יוקרה כהה", 320, "1457089328109-e5d9bd499191", "demo-cat-bouquets"),
  P(8, "קקטוס לבית", 119, "1558603668-6570496b66f8", "demo-cat-plants"),
  P(9, "ורד בודד באגרטל", 79, "1518895949257-7621c3c786d7", "demo-cat-roses"),
  P(10, "פרחי קוסמוס לבנים", 139, "1530092285049-1c42085fd395", "demo-cat-bouquets"),
  P(11, "פרלינים שוקולד", 89, "1549007994-cb92caebd54b", "demo-cat-gifts"),
  P(12, "פרחי אביב כתומים", 149, "1490750967868-88aa4486c946", "demo-cat-bouquets"),
];

export const isDemoId = (id: string | null | undefined) => !!id && id.startsWith("demo-");
