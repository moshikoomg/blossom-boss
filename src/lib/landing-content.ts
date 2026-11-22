import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types & defaults                                                  */
/* ------------------------------------------------------------------ */

export type StoreExample = { name: string; city: string; img: string; price: number };
export type FeatureItem = { icon: string; title: string; body: string };
export type Testimonial = { name: string; store: string; quote: string };
export type Faq = { q: string; a: string };

export interface LandingContent {
  hero: {
    badge: string;
    title1: string;
    title2: string;
    lede: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  heroImages: string[]; // exactly 4 URLs
  examples: {
    badge: string;
    title: string;
    lede: string;
    items: StoreExample[];
  };
  features: {
    title: string;
    lede: string;
    items: FeatureItem[];
  };
  testimonials: {
    title: string;
    items: Testimonial[];
  };
  faq: {
    title: string;
    items: Faq[];
  };
  finalCta: {
    title: string;
    lede: string;
    button: string;
  };
}

export const DEFAULT_LANDING: LandingContent = {
  hero: {
    badge: "הפלטפורמה של בעלי חנויות הפרחים בישראל",
    title1: "חנות פרחים אמיתית",
    title2: "בשתי לחיצות.",
    lede:
      "הקטלוג שלך, המחירים שלך, המשלוחים שלך — מעוצב יוקרתי, מקבל הזמנות לוואטסאפ ומחובר ל-Bit. בלי קוד, בלי מעצבים, בלי כאב ראש.",
    ctaPrimary: "פתח חנות עכשיו",
    ctaSecondary: "ראה דוגמאות חיות",
  },
  heroImages: [
    "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=600&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=600&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=600&q=70&auto=format&fit=crop",
  ],
  examples: {
    badge: "חנויות שכבר עלו השבוע",
    title: "חנויות אמיתיות. תוצאות אמיתיות.",
    lede: "דוגמה למראה של חנות שתקבל תוך 30 שניות — בלי תבניות גנריות.",
    items: [
      { name: "פרחי שרה", city: "תל אביב", img: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=500&q=70&auto=format&fit=crop", price: 189 },
      { name: "משתלת הגליל", city: "כרמיאל", img: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=500&q=70&auto=format&fit=crop", price: 249 },
      { name: "Blossom Studio", city: "הרצליה", img: "https://images.unsplash.com/photo-1567748157439-651aca2ff064?w=500&q=70&auto=format&fit=crop", price: 320 },
      { name: "אורבן בלום", city: "רמת גן", img: "https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?w=500&q=70&auto=format&fit=crop", price: 159 },
      { name: "פרחי כרמל", city: "חיפה", img: "https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=500&q=70&auto=format&fit=crop", price: 220 },
      { name: "בית הפרח", city: "ירושלים", img: "https://images.unsplash.com/photo-1494972308805-463bc619d34e?w=500&q=70&auto=format&fit=crop", price: 275 },
    ],
  },
  features: {
    title: "הכל מובנה. בלי פלאגינים. בלי בלגן.",
    lede: "פלטפורמה אחת שמחליפה אתר + מערכת הזמנות + סליקה + ניהול לקוחות.",
    items: [
      { icon: "MessageCircle", title: "הזמנות בוואטסאפ", body: "כל הזמנה נופלת ישירות לוואטסאפ העסקי שלך עם פרטי הלקוח, הזר והכתובת." },
      { icon: "Boxes", title: "ניהול מלאי חכם", body: "עדכון מחירים ומלאי בקליק. מסונכרן בין הסניפים והמכשירים." },
      { icon: "CreditCard", title: "Bit · אשראי · העברה", body: "תשלום ישיר ללקוח בלי עמלות סליקה מנופחות. כסף בעו״ש מיד." },
      { icon: "Tag", title: "קופונים ומבצעים", body: "קוד הנחה, מחיר מבצע, באנדל זרים — כל מהלך שיווקי בשליטה מלאה." },
      { icon: "Truck", title: "משלוחים לפי אזור", body: "מחיר משלוח דינמי, חלונות שעות, ושיוך לשליחים בלחיצה אחת." },
      { icon: "Bot", title: "מוכר AI 24/7", body: "סוכן חכם שעונה ללקוחות, ממליץ על זרים ומסגור הזמנות גם בלילה." },
    ],
  },
  testimonials: {
    title: "בעלי חנויות פרחים מספרים",
    items: [
      { name: "מורן לוי", store: "פרחי מורן · רעננה", quote: "תוך שלוש דקות מקליק על Google היתה לי חנות פעילה עם 32 זרים. הלקוחות מזמינים ישירות לוואטסאפ — סוף לבלגן ב-DM של אינסטגרם." },
      { name: "יוסי כהן", store: "משתלת הוורד · חולון", quote: "הקופונים והמבצעים הכפילו לי את ההזמנות בשישי. הAI עונה ללקוחות בערב במקומי." },
      { name: "תמר אברהם", store: "Blossom · תל אביב", quote: "עיצוב יוקרתי שמרגיש כמו אתר של 80,000 שקל. שילמתי כלום וקיבלתי הכל." },
    ],
  },
  faq: {
    title: "שאלות נפוצות",
    items: [
      { q: "כמה זמן לוקח להעלות חנות?", a: "שתי לחיצות. מתחברים עם Google, בוחרים אם יש לכם אתר קיים (אנחנו סורקים ומעלים אוטומטית) או מתחילים מתבנית — והחנות עולה תוך פחות מ-30 שניות." },
      { q: "אני לא טכני בכלל. אסתדר?", a: "בוודאי. הכל בעברית, מהמובייל, ובלי קוד. אם יש שאלה — צ׳אט תמיכה חי בעברית מהדאשבורד." },
      { q: "איך מקבלים תשלומים?", a: "Bit, אשראי, העברה בנקאית או מזומן במשלוח. הכסף נכנס ישירות לחשבון שלך — בלי עמלת ביניים." },
      { q: "אני יכול לעצב את החנות כמו שאני רוצה?", a: "כן. בוחרים פלטת צבעים, מעלים לוגו, משנים תמונות, עורכים מחירים — הכל מהדאשבורד בעברית בלי תלות בנו." },
      { q: "מה קורה אם אני רוצה לבטל?", a: "אפשר לעצור בכל רגע. אין התחייבות. החנות והנתונים נשארים שלך לייצוא." },
    ],
  },
  finalCta: {
    title: "החנות שלך יכולה לעלות\nעוד 30 שניות.",
    lede: "שתי לחיצות מפרידות בינך לבין חנות פרחים פעילה עם הזמנות חיות.",
    button: "פתח חנות עכשיו",
  },
};

/* ------------------------------------------------------------------ */
/*  Deep-merge defaults with stored partial content                   */
/* ------------------------------------------------------------------ */

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function mergeLanding(stored: unknown): LandingContent {
  const base: any = JSON.parse(JSON.stringify(DEFAULT_LANDING));
  if (!isObj(stored)) return base;
  for (const [k, v] of Object.entries(stored)) {
    if (Array.isArray(v)) {
      base[k] = v;
    } else if (isObj(v) && isObj(base[k])) {
      for (const [kk, vv] of Object.entries(v)) {
        if (vv === undefined || vv === null || vv === "") continue;
        base[k][kk] = vv;
      }
    } else if (v !== undefined && v !== null && v !== "") {
      base[k] = v;
    }
  }
  return base as LandingContent;
}

/* ------------------------------------------------------------------ */
/*  Client hook                                                       */
/* ------------------------------------------------------------------ */

export function useLandingContent(): LandingContent {
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("platform_content" as any)
        .select("data")
        .eq("key", "landing")
        .maybeSingle();
      if (cancelled) return;
      if (data && (data as any).data) {
        setContent(mergeLanding((data as any).data));
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return content;
}
