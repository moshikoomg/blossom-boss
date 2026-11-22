import { useEffect, useState } from "react";
import { fetchLegal, type LegalDoc } from "@/lib/legal";

const FALLBACK_DOCS: Record<"terms" | "privacy", LegalDoc> = {
  terms: {
    id: "fallback-terms",
    slug: "terms",
    title: "תקנון האתר ותנאי שימוש",
    intro:
      "ברוכים הבאים. השימוש באתר ובשירותים המוצעים בו כפוף לתנאים שלהלן. הגלישה והרכישה באתר מהוות הסכמה לתנאים אלה.",
    sections: [
      {
        heading: "כללי",
        paragraphs: [
          "האתר הוא חנות מקוונת לרכישת פרחים, זרים ומתנות. בעל החנות שומר לעצמו את הזכות לעדכן את התנאים מעת לעת.",
          "המשתמש מצהיר כי הוא בגיר (מעל גיל 18) או שיש בידו אישור הורה לבצע רכישה.",
        ],
      },
      {
        heading: "הזמנות ותשלום",
        paragraphs: [
          "ההזמנה נחשבת לסופית רק לאחר אישור התשלום וקבלת הודעת אישור מהחנות.",
          "התשלום מתבצע באמצעות Bit, כרטיס אשראי או באמצעי תשלום המוצגים בעמוד התשלום.",
        ],
      },
      {
        heading: "אספקה ומשלוחים",
        paragraphs: [
          "מועדי האספקה ועלויות המשלוח מוצגים בעת ההזמנה ותלויים באזור המסירה.",
          "החנות תעשה כל מאמץ לספק את ההזמנה במועד אך אינה אחראית לעיכובים שאינם בשליטתה.",
        ],
      },
      {
        heading: "ביטולים והחזרים",
        paragraphs: [
          "ניתן לבטל הזמנה עד 24 שעות לפני מועד המסירה. ביטול לאחר מועד זה — בכפוף לתנאי החנות.",
          "מוצרים מתכלים (פרחים טריים) אינם ניתנים להחזרה לאחר המסירה.",
        ],
      },
      {
        heading: "אחריות",
        paragraphs: [
          "החנות אחראית לאיכות המוצרים בעת מסירתם. במקרה של פגם — יש לפנות לחנות תוך 24 שעות.",
          "החנות לא תהיה אחראית לנזק עקיף או תוצאתי הנובע משימוש במוצרים.",
        ],
      },
      {
        heading: "סמכות שיפוט",
        paragraphs: [
          "על הסכם זה יחולו דיני מדינת ישראל בלבד. סמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.",
        ],
      },
    ],
    updated_at: new Date().toISOString(),
  },
  privacy: {
    id: "fallback-privacy",
    slug: "privacy",
    title: "מדיניות פרטיות",
    intro:
      "פרטיות המשתמשים חשובה לנו. מסמך זה מתאר אילו פרטים אנו אוספים, כיצד אנו משתמשים בהם, ואת זכויותיכם.",
    sections: [
      {
        heading: "מידע שאנו אוספים",
        paragraphs: [
          "פרטי קשר שאתם מספקים: שם, מספר טלפון, כתובת אימייל וכתובת למשלוח.",
          "פרטי הזמנות, היסטוריית רכישות והתכתבויות עם החנות.",
          "מידע טכני כגון כתובת IP, סוג דפדפן ומכשיר — נאסף לצורכי אבטחה ושיפור השירות.",
        ],
      },
      {
        heading: "השימוש במידע",
        paragraphs: [
          "ניהול הזמנות, יצירת קשר עם הלקוח, ושליחת עדכוני סטטוס הזמנה.",
          "שיפור חוויית המשתמש ושיווק מוצרים בכפוף להסכמת הלקוח.",
        ],
      },
      {
        heading: "שיתוף עם צדדים שלישיים",
        paragraphs: [
          "המידע מועבר רק לספקי שירות הנדרשים לביצוע ההזמנה (סליקה, משלוח, הודעות וואטסאפ).",
          "לא נמכור או נשכיר את פרטיכם לצדדים שלישיים למטרות שיווק.",
        ],
      },
      {
        heading: "אבטחת מידע",
        paragraphs: [
          "אנו נוקטים באמצעי אבטחה מקובלים להגנה על המידע, כולל הצפנה ובקרת גישה.",
          "למרות זאת, לא ניתן להבטיח אבטחה מוחלטת ברשת האינטרנט.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "האתר עושה שימוש בעוגיות לצורך תפעול תקין, שמירת העדפות וניתוח שימוש.",
          "ניתן לחסום עוגיות בהגדרות הדפדפן, אך הדבר עלול לפגוע בחלק מהשירותים.",
        ],
      },
      {
        heading: "זכויות המשתמש",
        paragraphs: [
          "באפשרותכם לבקש לעיין במידע השמור עליכם, לתקנו או למוחקו, באמצעות פנייה לבעל החנות.",
        ],
      },
    ],
    updated_at: new Date().toISOString(),
  },
};

export function LegalDocView({ slug }: { slug: "terms" | "privacy" }) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchLegal(slug)
      .then((d) => setDoc(d ?? FALLBACK_DOCS[slug]))
      .catch(() => setDoc(FALLBACK_DOCS[slug]))
      .finally(() => setLoading(false));
  }, [slug]);
  if (loading) return <div dir="rtl" className="max-w-3xl mx-auto p-8 text-muted-foreground">טוען…</div>;
  if (!doc) return <div dir="rtl" className="max-w-3xl mx-auto p-8">המסמך לא נמצא.</div>;
  return (
    <article dir="rtl" className="max-w-3xl mx-auto px-5 py-10 space-y-6 text-foreground leading-relaxed">
      <header className="space-y-2 border-b border-border pb-5">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        {doc.intro && <p className="text-muted-foreground whitespace-pre-wrap">{doc.intro}</p>}
        <p className="text-xs text-muted-foreground">עודכן לאחרונה: {new Date(doc.updated_at).toLocaleDateString("he-IL")}</p>
      </header>
      {doc.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          <h2 className="text-xl font-semibold">{i + 1}. {s.heading}</h2>
          <ul className="space-y-2 list-disc pr-5">
            {s.paragraphs.map((p, j) => (<li key={j} className="text-sm text-foreground/90">{p}</li>))}
          </ul>
        </section>
      ))}
    </article>
  );
}
