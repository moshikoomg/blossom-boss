## דוח בדיקה — מה עובד ומה לא

בדקתי דרך הדפדפן את הזרימה מההתחלה ועד מסך ה‑OAuth של גוגל, וצילבתי מול הקוד וה‑DB.

### ✅ עובד

1. **דף נחיתה (`/`)** — נטען במלואו, hero + תמונות + CTAs + cookie banner.
2. **כפתור "פתח חנות עכשיו"** (גם ב‑hero וגם ב‑header) — פותח את דיאלוג ההרשמה עם Google.
3. **דיאלוג Google Auth** — נראה תקין, כולל fallback "פתח את האתר הפומבי בכרטיסייה חדשה" כשרצים בתוך iframe של preview.
4. **OAuth redirect** — לחיצה על "התחבר עם Google" באתר הפומבי (`blossom-boss.lovable.app`) מובילה בהצלחה למסך ה‑Sign in של גוגל דרך broker של Lovable. אין יותר loop של redirect ל־`/auth`.
5. **DB מאוכלס** — 4 חנויות, 48 מוצרים, 59 משתמשים, 3 חברי חנות. כלומר ה‑skeleton בעמוד הראשי אמור להיפתר ברגע שהחנות מזוהה נכון (דומיין/slug).
6. **Auth API logs** — קריאות `/user` מחזירות 200, לא רואים 401 חוזרים.
7. **Network** — שאילתות `site_popups` ו‑`stores` מחזירות 200 (גם אם ריק).

### ⚠️ לא ניתן לבדוק עד הסוף מהסנדבוקס

- **השלמת לוגין עם Google בפועל** — אין לי גישה לחשבון גוגל לאישור הסכמה. עצרתי במסך ה‑Sign in. אם עדיין יש לך baseline של "נזרק חזרה ל‑`/auth`" — צריך לבדוק בחשבון אמיתי. תפתח את `https://blossom-boss.lovable.app/` בכרטיסייה רגילה (לא ב‑preview iframe), תתחבר עם גוגל, וספר לי בדיוק מה קורה (URL סופי, האם הדיאלוג של onboarding נפתח, האם יש שגיאה ב‑console).

### 🔎 ממצא שאני ממליץ לאמת ידנית

- **Storefront ב‑preview iframe** — השאילתה `stores?or=(primary_domain.eq.<preview-host>,slug.eq.<preview-host>)` מחזירה `[]`, כך שאין חנות מזוהה לדומיין ה‑preview. זה אומר שהמשתמש שרואה את ה‑preview רואה landing ולא storefront אמיתי — וזה תקין כשהוא לא מחובר; אבל אם משתמש מחובר עם חנות צריך לוודא שזה מבוסס על `tmm_current_store_id` ולא רק על דומיין.

### מה אני מציע לעשות בהמשך

1. תאשר/תפריך בעצמך את סיום הזרימה של Google בחשבון אמיתי על הדומיין הפומבי.
2. אם נפלת חזרה ל‑`/auth` — תעתיק לי את ה‑URL המדויק ברגע הנפילה + console errors, ונרד לדיוק אחרון (כנראה state של `tmm_oauth_*` ב‑sessionStorage או חזרה ל‑host לא נכון).
3. אם הכל עובד — נסגור ונעבור לבאגים הבאים מהרשימה המקורית (skeleton empty‑state, URL encoding ב‑`/onboarding`, keydown handler לסגירת widget וכו').

### Technical details

- `src/lib/oauth-flow.ts` כבר מטפל ב‑preview iframe ע"י פתיחת `PUBLIC_APP_ORIGIN` בטאב חדש.
- `__root.tsx` `GlobalErrorSoftener` מתעלם מ‑401 כש‑`hasOpenOnboardingParam()` פעיל וממתין `awaitSafeSession` לפני redirect.
- `routes/auth.tsx`, `routes/index.tsx`, `routes/admin.tsx` כולם בודקים `awaitSafeSession` + `?openOnboarding=1` לפני כל החלטה.
- אין שינוי קוד ב‑plan הזה — זה דוח בלבד. תאשר ואני אטפל בבאג הבא לפי תיעדוף שלך.
