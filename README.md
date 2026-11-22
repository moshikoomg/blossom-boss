# Blossom Boss

פלטפורמת SaaS לחנויות פרחים (TanStack Start + Supabase + Cloudflare Workers).

## הרצה מקומית

```bash
cp .env.example .env   # למלא מפתחות Supabase ו-AI
npm install
npm run dev            # http://localhost:8080
```

## בנייה ופריסה

```bash
npm run build
npm run deploy         # wrangler deploy (Cloudflare Workers)
```

## מסד נתונים

כל המיגרציות נמצאות ב-`supabase/migrations`. לפרויקט Supabase חדש:

```bash
supabase link --project-ref <ref>
supabase db push
```

## AI

ה-AI עובד מול כל ספק תואם OpenAI. ברירת המחדל היא Google Gemini (`gemini-2.5-flash`), עם `AI_API_KEY` מ-Google AI Studio.
