/** Supabase auth errors come back in English; show the common ones in Hebrew. */
export function authErrorHe(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "אימייל או סיסמה שגויים";
  if (m.includes("email not confirmed"))
    return "צריך לאשר את כתובת המייל. בדקו את תיבת הדואר (וגם ספאם).";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "המייל הזה כבר רשום. אפשר להתחבר.";
  if (m.includes("password should be") || m.includes("at least 6"))
    return "הסיסמה צריכה להכיל לפחות 6 תווים";
  if (m.includes("invalid email") || m.includes("unable to validate email"))
    return "כתובת אימייל לא תקינה";
  if (m.includes("rate limit") || m.includes("too many"))
    return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
  return "משהו השתבש. נסו שוב.";
}
