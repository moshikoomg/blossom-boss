import { useEffect, useState } from "react";
import { X, Bot, Eye, Pencil, Sparkles, Smartphone, MessageCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { markOAuthStart, publishedUrl, shouldUsePublishedOAuth } from "@/lib/oauth-flow";

export const AI_CHAT_FLAG = "tmm_ai_chat_enabled";
export const PWA_ENABLED_FLAG = "tmm_pwa_enabled";
export const PULSE_BACKSTAGE_FLAG = "tmm_pulse_backstage";
export const SEQUENCE_DONE_FLAG = "tmm_onboarding_sequence_done";
export const ONBOARDING_EVENT = "tmm:onboarding-whatsapp-entered";
export const AI_CHAT_CHANGED_EVENT = "tmm:ai-chat-changed";
export const PWA_CHANGED_EVENT = "tmm:pwa-changed";
export const WA_FLY_EVENT = "tmm:wa-fly-in";

type Phase = "hidden" | "ai-offer" | "pwa-offer" | "next-action";

// Slower, more cinematic pacing so each step lands before the next slides in.
const FIRST_DELAY_MS = 3400;     // confetti → first popup
const BETWEEN_DELAY_MS = 3200;   // gap between popups after a Yes
const SHORT_DELAY_MS = 1600;     // gap after a "No" — still breathing room

/**
 * Orchestrates the celebratory post-WhatsApp onboarding sequence:
 *   confetti (fired by ProfileStep) → "Enable AI bot?" → "Edit or view?" →
 *   set a pulse flag for the backstage button.
 */
export function OnboardingSequencer() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const nav = useNavigate();

  useEffect(() => {
    function start() {
      try {
        if (localStorage.getItem(SEQUENCE_DONE_FLAG)) return;
      } catch {}
      // Let the confetti + WhatsApp fly-in breathe before the first popup
      // (~3.4s) so the merchant can absorb the win.
      window.setTimeout(() => setPhase("ai-offer"), FIRST_DELAY_MS);
    }
    window.addEventListener(ONBOARDING_EVENT, start);
    return () => window.removeEventListener(ONBOARDING_EVENT, start);
  }, []);

  function enableChat(enabled: boolean) {
    try {
      localStorage.setItem(AI_CHAT_FLAG, enabled ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(AI_CHAT_CHANGED_EVENT));
    // Hide the modal so the merchant can SEE the chat bubble pop in / the
    // store update, then move on to the PWA question.
    setPhase("hidden");
    window.setTimeout(
      () => setPhase("pwa-offer"),
      enabled ? BETWEEN_DELAY_MS : SHORT_DELAY_MS,
    );
  }

  function enablePwa(enabled: boolean) {
    try {
      localStorage.setItem(PWA_ENABLED_FLAG, enabled ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(PWA_CHANGED_EVENT));
    setPhase("hidden");
    // Skip the "where to continue?" popup — the merchant is already viewing
    // the live storefront, so we just mark the sequence complete and let
    // them keep exploring the site that was just created for them.
    try {
      localStorage.setItem(SEQUENCE_DONE_FLAG, "1");
      localStorage.setItem(PULSE_BACKSTAGE_FLAG, "1");
    } catch {}
  }

  async function finish(goView: boolean) {
    try {
      localStorage.setItem(SEQUENCE_DONE_FLAG, "1");
      localStorage.setItem(PULSE_BACKSTAGE_FLAG, "1");
    } catch {}
    setPhase("hidden");
    if (goView) {
      // User wants to see the storefront — close the wizard / admin context.
      nav({ to: "/" });
      return;
    }
    // "Continue editing" — the merchant wants the backstage admin. If they
    // are already authenticated we route straight there. Otherwise we kick
    // off the same Google OAuth flow the top-bar "להמשך הרשמה" button uses
    // so they never see the generic "נדרשת התחברות" gate.
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        nav({ to: "/admin" });
        return;
      }
    } catch {}
    try {
      const url = new URL(window.location.href);
      const isPreview = url.searchParams.get("preview") === "1";
      if (shouldUsePublishedOAuth()) {
        window.open(publishedUrl("/admin"), "_blank", "noopener");
        toast.info("פותח את האתר הפומבי בכרטיסייה חדשה להתחברות.");
        return;
      }
      if (isPreview) {
        // Persist the visitor's preview brand so PreviewBanner can finalize
        // the real store after Google returns, then redirect into /admin.
        const pname = url.searchParams.get("pname")?.trim() || "החנות שלי";
        const pcity = url.searchParams.get("pcity")?.trim() || "";
        let theme: Record<string, string> = {};
        try {
          const raw = url.searchParams.get("ptheme");
          if (raw) theme = JSON.parse(decodeURIComponent(escape(atob(raw))));
        } catch {}
        localStorage.setItem(
          "tmm_pending_store",
          JSON.stringify({ name: pname, city: pcity, theme }),
        );
        const ptheme = url.searchParams.get("ptheme") || "";
        const redirectTo = `${window.location.origin}/?store=11111111-1111-1111-1111-111111111111&preview=1&pname=${encodeURIComponent(pname)}&pcity=${encodeURIComponent(pcity)}&ptheme=${encodeURIComponent(ptheme)}&createStore=1&adminAfter=1`;
        markOAuthStart("/admin");
        const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTo });
        if ((res as any)?.error) {
          toast.error("נכשלה התחברות עם Google");
        }
        return;
      }
      // Not in preview mode — just send them through Google straight back to /admin.
      markOAuthStart("/admin");
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/admin`,
      });
      if ((res as any)?.error) {
        toast.error("נכשלה התחברות עם Google");
      }
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בהתחברות");
    }
  }

  if (phase === "hidden") return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/55 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        // Strict-dismissal: backdrop click is a no-op. The merchant must
        // either confirm a choice or hit the "X" button to advance.
        e.stopPropagation();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-card border-2 border-primary/30 shadow-2xl rounded-3xl p-6 sm:p-7 animate-in zoom-in-95 box-border max-w-[calc(100vw-1.5rem)]"
      >
        <button
          onClick={() => {
            if (phase === "ai-offer") enableChat(false);
            else if (phase === "pwa-offer") enablePwa(false);
            else finish(false);
          }}
          aria-label="סגור"
          className="absolute top-3 left-3 p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
        >
          <X size={18} />
        </button>

        {phase === "ai-offer" && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center mb-4 shadow-md">
              <Bot size={26} />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-foreground mb-2">
              להפעיל בוט AI לשירות הלקוחות?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              הבוט יענה ללקוחות שלך באופן דמוי-אנושי בכל שעה — ממליץ על מוצרים,
              עוזר להזמין, ומפנה אותך רק כשצריך התערבות אישית.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => enableChat(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                לא עכשיו
              </button>
              <button
                onClick={() => enableChat(true)}
                className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition inline-flex items-center justify-center gap-2"
              >
                <Sparkles size={16} /> כן, הפעל את הבוט
              </button>
            </div>
          </>
        )}

        {phase === "pwa-offer" && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center mb-4 shadow-md">
              <Smartphone size={26} />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-foreground mb-2">
              לאפשר ללקוחות להתקין את החנות כאפליקציה?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              האם תרצה לאפשר ללקוחות שלך להתקין את החנות כאפליקציה ישירות
              על מסך הבית שלהם? (PWA) זהו כלי שיווקי עוצמתי המגדיל את
              הרכישות החוזרות ב-30% ושומר על העסק שלך במרחק קליק אחד מהנייד
              שלהם, ללא צורך בהורדה מחנויות האפליקציות.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => enablePwa(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                לא כרגע
              </button>
              <button
                onClick={() => enablePwa(true)}
                className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition inline-flex items-center justify-center gap-2"
              >
                <Smartphone size={16} /> כן, הפעל בחנות שלי
              </button>
            </div>
          </>
        )}

        {phase === "next-action" && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center mb-4 shadow-md">
              <Eye size={26} />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-foreground mb-2">
              לאן ממשיכים מכאן?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              אפשר להמשיך לערוך את החנות, או להציץ באתר שלך כדי לראות איך
              הוא נראה ללקוחות.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => finish(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold border border-border hover:bg-muted transition inline-flex items-center justify-center gap-2"
              >
                <Pencil size={14} /> ממשיכים לערוך
              </button>
              <button
                onClick={() => finish(true)}
                className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition inline-flex items-center justify-center gap-2"
              >
                <Eye size={16} /> להציץ באתר
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** True if the merchant accepted the AI chat offer during onboarding. */
export function isAiChatEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AI_CHAT_FLAG) === "1";
  } catch {
    return false;
  }
}

/** True if the merchant opted in to the PWA "Install app" button. Defaults
 *  to false so storefronts never advertise install until the owner approves. */
export function isPwaEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PWA_ENABLED_FLAG) === "1";
  } catch {
    return false;
  }
}

/**
 * One-shot fly-in animation: a giant WhatsApp bubble appears at the centre
 * of the screen and animates into its permanent home in the bottom-right
 * corner. Mounted globally and listens for `WA_FLY_EVENT`. The real
 * `WhatsAppFloater` takes over as soon as the animation ends — there is no
 * visual seam because the end coordinates match.
 */
export function WhatsAppFlyIn() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    function trigger() {
      setVisible(true);
      window.setTimeout(() => setVisible(false), 2300);
    }
    window.addEventListener(WA_FLY_EVENT, trigger);
    return () => window.removeEventListener(WA_FLY_EVENT, trigger);
  }, []);
  if (!visible) return null;
  return (
    <>
      <div className="wa-fly-in" aria-hidden>
        <MessageCircle size={26} className="fill-white" />
      </div>
      <div className="wa-fly-label" dir="rtl">
        <div className="bg-card border-2 border-[#25D366] text-foreground font-black text-sm px-4 py-2 rounded-full shadow-2xl whitespace-nowrap">
          הוואטסאפ שלך מחובר! 🎉
        </div>
      </div>
    </>
  );
}
