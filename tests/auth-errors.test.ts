import { describe, expect, it } from "vitest";
import { authErrorHe } from "@/lib/auth-errors";

describe("auth errors in Hebrew", () => {
  it("translates common Supabase messages", () => {
    expect(authErrorHe("Invalid login credentials")).toBe("אימייל או סיסמה שגויים");
    expect(authErrorHe("Email not confirmed")).toContain("לאשר");
    expect(authErrorHe("User already registered")).toContain("כבר רשום");
    expect(authErrorHe("Password should be at least 6 characters.")).toContain("6");
  });
  it("never shows raw English for unknown errors", () => {
    expect(authErrorHe("Some internal thing")).toBe("משהו השתבש. נסו שוב.");
  });
});
