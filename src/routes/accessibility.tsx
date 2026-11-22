import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "הצהרת נגישות — Blossom Boss" },
      { name: "description", content: "הצהרת הנגישות של האתר, רמת התקן, אמצעי הסיוע הזמינים ופרטי קצין הנגישות." },
      { property: "og:title", content: "הצהרת נגישות" },
      { property: "og:description", content: "האתר מונגש לפי תקן WCAG 2.1 רמה AA." },
    ],
  }),
  component: AccessibilityPage,
});

function AccessibilityPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <header className="space-y-2">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← חזרה לעמוד הבית</Link>
          <h1 className="text-3xl md:text-4xl font-black">הצהרת נגישות</h1>
          <p className="text-sm text-muted-foreground">עודכן לאחרונה: {new Date().toLocaleDateString("he-IL")}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">מחויבות לנגישות</h2>
          <p className="text-muted-foreground leading-relaxed">
            אנחנו מאמינים ששירותינו חייבים להיות נגישים לכל אדם, ללא תלות במוגבלות.
            האתר מתוכנן בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013
            ומיועד לעמוד ברמת תאימות AA על-פי תקן WCAG 2.1.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">אמצעי הנגישות באתר</h2>
          <ul className="list-disc pr-6 space-y-1 text-muted-foreground">
            <li>סרגל נגישות קבוע בפינה השמאלית התחתונה.</li>
            <li>שינוי גודל טקסט, ריווח שורות וריווח אותיות.</li>
            <li>מצבי ניגודיות גבוהה, מצב כהה, מצב בהיר, היפוך צבעים וגווני אפור.</li>
            <li>הדגשת קישורים, הדגשת כותרות, סמן גדול וקו עזר לקריאה.</li>
            <li>עצירת אנימציות והסתרת תמונות.</li>
            <li>איפוס מלא של הגדרות הנגישות בכל עת.</li>
            <li>ניווט מלא בעזרת המקלדת ותמיכה בקוראי מסך מודרניים.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">סייגים</h2>
          <p className="text-muted-foreground leading-relaxed">
            ייתכנו עמודים, רכיבים או תכנים של צד שלישי שלא הותאמו לנגישות מלאה. אנו פועלים באופן שוטף להרחיב את ההתאמות.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">פנייה לרכז נגישות</h2>
          <p className="text-muted-foreground leading-relaxed">
            נתקלת בבעיית נגישות? נשמח לסייע ולתקן.
            ניתן לפנות לרכז הנגישות באמצעות עמוד <Link to="/" className="text-primary underline">צור קשר</Link> או
            בדוא"ל לכתובת ההתקשרות המופיעה בעמוד הבית.
          </p>
        </section>

        <section className="space-y-2 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            הצהרה זו מעודכנת מעת לעת בהתאם לשינויים באתר ובתקנים. אנו מתחייבים להמשיך ולשפר את חוויית השימוש לכלל המשתמשים.
          </p>
        </section>
      </main>
    </div>
  );
}
