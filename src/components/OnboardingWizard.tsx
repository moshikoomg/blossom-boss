import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Globe,
  Loader2,
  Palette,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import {
  getScanByToken,
  startScan,
  runScrapeInBackground,
  type DiscoveredSite,
  type ScanRow,
} from "@/lib/scan.functions";
import { useServerFn } from "@tanstack/react-start";
import { finalizeScanIntoStore } from "@/lib/onboarding-finalize.functions";
import { createStoreForUser } from "@/lib/store-create.functions";
import { supabase } from "@/integrations/supabase/client";
import { ScanPreview } from "@/components/ScanPreview";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Phase =
  | "track"
  | "a-form"
  | "a-searching"
  | "a-preview"
  | "a-select"
  | "a-manual"
  | "a-fallback-choice"
  | "b-palette";

interface OnboardingWizardProps {
  onClose?: () => void;
  onComplete?: (ctx: OnboardingResult) => void;
  initialBusinessName?: string;
  autoStart?: boolean;
  /**
   * When true the wizard renders inside a host container (e.g. a Radix
   * Dialog) — it drops its full-screen chrome, BackgroundFx, top logo bar,
   * PhaseChip, and outer animated card so the host owns the surface.
   */
  embedded?: boolean;
}

export interface OnboardingResult {
  track: "existing" | "new";
  business_name?: string;
  site_url?: string;
  palette?: PalettePreset;
  storeId?: string;
}

interface PalettePreset {
  id: string;
  label: string;
  primary: string; // hex
  accent: string; // hex
  bg: string; // hex
  text: string; // hex
}

const PRESETS: PalettePreset[] = [
  {
    id: "rose-noir",
    label: "ורוד מהודר",
    primary: "#c9356b",
    accent: "#f8c8d8",
    bg: "#fdf6f7",
    text: "#1c0d12",
  },
  {
    id: "ocean",
    label: "אוקיינוס רגוע",
    primary: "#1f6f8b",
    accent: "#5cbdb9",
    bg: "#f3fafc",
    text: "#0c2340",
  },
  {
    id: "midnight-gold",
    label: "לילה זהוב",
    primary: "#0d0d0d",
    accent: "#c9a84c",
    bg: "#fbf9f4",
    text: "#1a1a1a",
  },
];

const STORAGE_KEY = "tmm_onboarding_state";

/* -------------------------------------------------------------------------- */
/*  Wizard                                                                    */
/* -------------------------------------------------------------------------- */

export function OnboardingWizard({
  onClose,
  onComplete,
  initialBusinessName,
  autoStart,
  embedded,
}: OnboardingWizardProps) {
  const finalizeFn = useServerFn(finalizeScanIntoStore);
  const createStoreFn = useServerFn(createStoreForUser);
  // New simplified flow: land directly on the URL screen. The track picker
  // is gone — there are only two options: enter a URL + continue with Google,
  // or tap "אין לי אתר" to jump straight to the palette picker.
  const [phase, setPhase] = useState<Phase>("a-form");

  // Track A state
  const [businessName, setBusinessName] = useState(initialBusinessName ?? "");
  const [siteUrl, setSiteUrl] = useState("");
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [chosenUrl, setChosenUrl] = useState<string>("");
  const [manualUrl, setManualUrl] = useState("");
  const [scanFailureReason, setScanFailureReason] = useState<string | null>(null);

  // Generic UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Track B state
  const [paletteId, setPaletteId] = useState<string>(PRESETS[0].id);
  const [customPrimary, setCustomPrimary] = useState("#7c3aed");
  const [customAccent, setCustomAccent] = useState("#c4b5fd");
  const [useCustom, setUseCustom] = useState(false);

  /* ----------------------- Track A: poll scan results ----------------------- */

  useEffect(() => {
    if (!scanToken || phase !== "a-searching") return;
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 25; // ~25s

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const row = await getScanByToken(scanToken);
        if (!cancelled && row) {
          setScan(row);
          if (row.status === "ready" || row.status === "failed") {
            advanceFromSearch(row);
            return;
          }
        }
      } catch (err) {
        console.error("getScanByToken poll failed", err);
      }
      if (!cancelled) {
        if (attempts >= MAX_ATTEMPTS) {
          setTimedOut(true);
          setPhase("a-manual");
        } else {
          window.setTimeout(tick, 1000);
        }
      }
    };

    window.setTimeout(tick, 1200);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanToken, phase]);

  function advanceFromSearch(row: ScanRow) {
    const sites = row.discovered_sites ?? [];
    if (row.status === "failed") {
      // No synthetic-template fallback: send the user back to fix the URL.
      setScanFailureReason("scan_failed");
      toast.error("נדרשת כתובת אתר תקינה כדי לבצע סריקה");
      setError("לא הצלחנו לסרוק את האתר. ודא שהכתובת תקינה ושהאתר נגיש.");
      setPhase("a-form");
      return;
    }
    // As soon as the scan returns ready, show the user a premium
    // preview of what we extracted. They confirm with "build my store"
    // which then triggers autoFinalize.
    if (row.status === "ready") {
      setScan(row);
      // Skip the in-popup preview — finalize the store immediately so the
      // merchant lands on the real, standing site instead of a preview.
      void autoFinalize(row, row.discovered_sites ?? []);
      return;
    }
    if (sites.length === 0) {
      setPhase("a-manual");
    } else {
      setPhase("a-select");
    }
  }

  async function autoFinalize(row: ScanRow, sites: DiscoveredSite[]) {
    setError(null);
    setSubmitting(true);
    try {
      // Ensure we have a user — anonymous is fine. Skip if already signed in.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr) throw anonErr;
      }

      const res = await finalizeFn({ data: { scan_token: row.scan_token } });

      // Persist the new store id so /admin & StoreProvider pick it up immediately.
      try {
        localStorage.setItem("tmm_current_store_id", res.storeId);
        localStorage.setItem("tmm_store_override", res.storeId);
      } catch {
        /* ignore */
      }

      const url = sites[0]?.url ?? "";
      const result: OnboardingResult = {
        track: "existing",
        business_name: businessName.trim() || undefined,
        site_url: url || undefined,
        storeId: res.storeId,
      };
      persist(result);
      onComplete?.(result);
    } catch (err) {
      console.error("autoFinalize failed", err);
      setError("לא הצלחנו להקים את החנות אוטומטית. אפשר להמשיך ידנית.");
      // Fallback to the existing manual UI
      if (sites.length === 0) setPhase("a-manual");
      else setPhase("a-select");
    } finally {
      setSubmitting(false);
    }
  }

  /* ----------------------- Persistence ----------------------- */

  const persist = useCallback((result: OnboardingResult) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {
      /* ignore */
    }
  }, []);

  /* ----------------------- Auto-start (from landing prefill) ----------------------- */
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (phase !== "a-form") return;
    if (!businessName.trim()) return;
    autoStartedRef.current = true;
    void handleStartSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, phase]);

  /* ----------------------- Handlers ----------------------- */

  function isValidUrl(v: string) {
    const trimmed = v.trim();
    if (trimmed.length < 4) return false;
    return /^[^\s.]+\.[^\s]{2,}$/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
  }

  /** Strict website URL validator — requires a real domain with TLD. */
  function isValidWebsiteUrl(v: string): boolean {
    const trimmed = v.trim();
    if (!trimmed) return false;
    // Strip scheme (case-insensitive) and any leading slashes.
    const noScheme = trimmed.replace(/^https?:\/\//i, "").replace(/^\/+/, "");
    // Hostname is the part before the first path/query/hash.
    const host = noScheme.split(/[/?#]/)[0] ?? "";
    if (!host || host.length > 253) return false;
    if (/\s/.test(host)) return false;
    // ASCII-only domain: a.b … .tld (TLD 2–24 chars, letters only).
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i.test(host)) return false;
    // Sanity check via WHATWG URL parser.
    try {
      const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${noScheme}`);
      if (!u.hostname.includes(".")) return false;
    } catch {
      return false;
    }
    return true;
  }

  async function handleStartSearch() {
    if (submitting) return;
    if (!isValidWebsiteUrl(siteUrl)) {
      toast.error("נדרשת כתובת אתר תקינה כדי לבצע סריקה");
      setError("הזן כתובת אתר תקינה (לדוגמה: example.co.il)");
      return;
    }
    setError(null);
    setTimedOut(false);
    setScanFailureReason(null);
    setChosenUrl(siteUrl.trim());
    // Show the searching animation. The poll effect on "a-searching"
    // will auto-create an anonymous user + finalize the store as soon
    // as the scrape returns ready, dropping the user straight into the
    // live store preview — no phone, no OTP.
    setPhase("a-searching");
    (async () => {
      try {
        const result = await startScan({
          business_name: businessName.trim() || undefined,
          source_url: siteUrl.trim(),
          mode: "url",
        });
        setScanToken(result.scan_token);
        // Kick off the heavy scrape — runs while the user watches the
        // brief "scanning your site" animation.
        runScrapeInBackground(result.scan_token, siteUrl.trim());
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`לא הצלחנו להתחיל את הסריקה. ${msg}`);
        setPhase("a-form");
      }
    })();
  }

  /** User chose: "use the Platform Template as my starting base". */
  async function handleUseTemplate() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr) throw anonErr;
      }
      const res = await createStoreFn({
        data: {
          name: businessName.trim() || "החנות שלי",
          city: "",
          theme: {},
        },
      });
      if (!res?.storeId) throw new Error("missing_store_id_after_create");
      try {
        localStorage.setItem("tmm_current_store_id", res.storeId);
        localStorage.setItem("tmm_store_override", res.storeId);
      } catch {
        /* ignore */
      }
      const result: OnboardingResult = {
        track: "new",
        business_name: businessName.trim() || undefined,
        storeId: res.storeId,
      };
      persist(result);
      onComplete?.(result);
    } catch (err) {
      console.error("handleUseTemplate failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`לא הצלחנו ליצור חנות מהתבנית. ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  /** Fallback path: user picked a site from the scan results. Skip OTP — go straight to autoFinalize. */
  async function pickSite(site: DiscoveredSite) {
    setChosenUrl(site.url);
    if (scan) await autoFinalize(scan, [site, ...(scan.discovered_sites ?? []).filter((s) => s.url !== site.url)]);
  }

  /** Fallback path: user typed a URL manually. Start a fresh scan and let the searching loop autoFinalize. */
  async function submitManualUrl() {
    if (!isValidUrl(manualUrl)) {
      setError("אנא הזן כתובת תקינה (לדוגמה: example.co.il)");
      return;
    }
    const url = manualUrl.trim();
    setError(null);
    setChosenUrl(url);
    setSubmitting(true);
    try {
      const { scan_token } = await startScan({
        source_url: url,
        business_name: businessName.trim() || undefined,
        mode: "url",
      });
      setScanToken(scan_token);
      runScrapeInBackground(scan_token, url);
      setPhase("a-searching");
    } catch (err) {
      console.error(err);
      setError("לא הצלחנו לרשום את הכתובת. נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishTrackB() {
    if (submitting) return;
    const preset = useCustom
      ? {
          id: "custom",
          label: "מותאם אישית",
          primary: customPrimary,
          accent: customAccent,
          bg: "#ffffff",
          text: "#0a0a0a",
        }
      : PRESETS.find((p) => p.id === paletteId) ?? PRESETS[0];
    setError(null);
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr) throw anonErr;
      }
      const res = await createStoreFn({
        data: {
          name: businessName.trim() || "החנות שלי",
          city: "",
          theme: { primary: preset.primary, accent: preset.accent, bg: preset.bg, text: preset.text },
        },
      });
      if (!res?.storeId) throw new Error("missing_store_id_after_create");
      try {
        localStorage.setItem("tmm_current_store_id", res.storeId);
        localStorage.setItem("tmm_store_override", res.storeId);
      } catch {
        /* ignore */
      }
      const result: OnboardingResult = { track: "new", palette: preset, storeId: res.storeId };
      persist(result);
      onComplete?.(result);
    } catch (err) {
      console.error("finishTrackB failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`לא הצלחנו ליצור את החנות. ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  /* ----------------------- Render ----------------------- */

  // Full-screen preview takes over the entire viewport (no card chrome).
  if (phase === "a-preview" && scan) {
    return (
      <ScanPreview
        scan={scan}
        sourceUrl={chosenUrl || siteUrl}
        submitting={submitting}
        error={error}
        onBack={() => {
          setError(null);
          setPhase("a-form");
        }}
        onBuild={() => {
          void autoFinalize(scan, scan.discovered_sites ?? []);
        }}
      />
    );
  }

  // Embedded render — host (e.g. landing page Dialog) owns the chrome.
  if (embedded) {
    return (
      <div dir="rtl" className="text-foreground">
        {phase === "a-form" && (
          <AForm
            siteUrl={siteUrl}
            setSiteUrl={setSiteUrl}
            urlValid={isValidWebsiteUrl(siteUrl)}
            submitting={submitting}
            error={error}
            onNext={handleStartSearch}
            onNoWebsite={() => {
              setError(null);
              setPhase("b-palette");
            }}
          />
        )}
        {phase === "a-searching" && (
          <Searching businessName={businessName} onCancel={() => setPhase("a-form")} />
        )}
        {phase === "a-select" && (
          <SiteSelect
            sites={scan?.discovered_sites ?? []}
            onPick={pickSite}
            onManual={() => setPhase("a-manual")}
            submitting={submitting}
          />
        )}
        {phase === "a-manual" && (
          <ManualUrl
            url={manualUrl}
            setUrl={setManualUrl}
            onSubmit={submitManualUrl}
            submitting={submitting}
            error={error}
            timedOut={timedOut}
          />
        )}
        {phase === "a-fallback-choice" && (
          <FallbackChoice
            businessName={businessName}
            reason={scanFailureReason}
            manualUrl={manualUrl}
            setManualUrl={setManualUrl}
            onSubmitManual={submitManualUrl}
            onUseTemplate={handleUseTemplate}
            submitting={submitting}
            error={error}
          />
        )}
        {phase === "b-palette" && (
          <PalettePicker
            paletteId={paletteId}
            setPaletteId={(id) => {
              setPaletteId(id);
              setUseCustom(false);
            }}
            useCustom={useCustom}
            setUseCustom={setUseCustom}
            customPrimary={customPrimary}
            setCustomPrimary={setCustomPrimary}
            customAccent={customAccent}
            setCustomAccent={setCustomAccent}
            onContinue={finishTrackB}
            businessName={businessName}
            setBusinessName={setBusinessName}
            submitting={submitting}
          />
        )}
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] overflow-hidden bg-[oklch(0.16_0.04_265)] text-white"
    >
      <BackgroundFx />

      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[oklch(0.78_0.18_300)] to-[oklch(0.65_0.22_265)] grid place-items-center shadow-lg shadow-[oklch(0.65_0.22_265)]/40">
            <Sparkles size={18} />
          </div>
          <span className="font-black tracking-tight text-lg">Studio AI</span>
        </div>
        <PhaseChip phase={phase} />
        {onClose ? (
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-sm font-medium"
          >
            דלג
          </button>
        ) : (
          <div className="w-12" />
        )}
      </div>

      <div className="relative z-10 flex items-start sm:items-center justify-center px-4 pb-10 min-h-[calc(100%-5rem)] overflow-y-auto">
        <div className="relative w-full max-w-2xl">
          <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-[oklch(0.78_0.18_300)]/30 via-[oklch(0.65_0.22_265)]/20 to-transparent blur-2xl pointer-events-none" />
          <div className="relative rounded-3xl bg-white/[0.06] backdrop-blur-2xl border border-white/10 shadow-2xl p-7 sm:p-10 animate-in fade-in zoom-in-95">
            {phase !== "track" && (
              <button
                onClick={goBack}
                className="absolute top-5 left-5 text-white/60 hover:text-white inline-flex items-center gap-1 text-xs font-medium"
              >
                <ArrowLeft size={14} /> חזרה
              </button>
            )}

            {phase === "track" && (
              <TrackPicker
                onPickExisting={() => {
                  setError(null);
                  setPhase("a-form");
                }}
                onPickNew={() => {
                  setError(null);
                  setPhase("b-palette");
                }}
              />
            )}

            {phase === "a-form" && (
              <AForm
                siteUrl={siteUrl}
                setSiteUrl={setSiteUrl}
                urlValid={isValidWebsiteUrl(siteUrl)}
                submitting={submitting}
                error={error}
                onNext={handleStartSearch}
                onNoWebsite={() => {
                  setError(null);
                  setPhase("b-palette");
                }}
              />
            )}

            {phase === "a-searching" && (
              <Searching businessName={businessName} onCancel={() => setPhase("a-form")} />
            )}

            {phase === "a-select" && (
              <SiteSelect
                sites={scan?.discovered_sites ?? []}
                onPick={pickSite}
                onManual={() => setPhase("a-manual")}
                submitting={submitting}
              />
            )}

            {phase === "a-manual" && (
              <ManualUrl
                url={manualUrl}
                setUrl={setManualUrl}
                onSubmit={submitManualUrl}
                submitting={submitting}
                error={error}
                timedOut={timedOut}
              />
            )}

            {phase === "a-fallback-choice" && (
              <FallbackChoice
                businessName={businessName}
                reason={scanFailureReason}
                manualUrl={manualUrl}
                setManualUrl={setManualUrl}
                onSubmitManual={submitManualUrl}
                onUseTemplate={handleUseTemplate}
                submitting={submitting}
                error={error}
              />
            )}

            {phase === "b-palette" && (
              <PalettePicker
                paletteId={paletteId}
                setPaletteId={(id) => {
                  setPaletteId(id);
                  setUseCustom(false);
                }}
                useCustom={useCustom}
                setUseCustom={setUseCustom}
                customPrimary={customPrimary}
                setCustomPrimary={setCustomPrimary}
                customAccent={customAccent}
                setCustomAccent={setCustomAccent}
                onContinue={finishTrackB}
                businessName={businessName}
                setBusinessName={setBusinessName}
                submitting={submitting}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function goBack() {
    setError(null);
    if (phase === "a-form" || phase === "b-palette") {
      setPhase("track");
      return;
    }
    if (phase === "a-searching") {
      setPhase("a-form");
      return;
    }
    if (phase === "a-select" || phase === "a-manual") {
      setPhase(scanToken ? "a-searching" : "a-form");
      return;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Header chip                                                               */
/* -------------------------------------------------------------------------- */

function PhaseChip({ phase }: { phase: Phase }) {
  const map: Record<Phase, string> = {
    track: "בחירת מסלול",
    "a-form": "פרטי עסק",
    "a-searching": "מחפש את האתר…",
    "a-preview": "תצוגה מקדימה",
    "a-select": "בחירת אתר",
    "a-manual": "הזנת כתובת",
    "a-fallback-choice": "המשך בלי סריקה",
    "b-palette": "בחירת עיצוב",
  };
  return (
    <div className="hidden sm:inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white/10 text-xs font-bold text-white/85">
      <Sparkles size={12} />
      {map[phase]}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track Picker                                                              */
/* -------------------------------------------------------------------------- */

function TrackPicker({
  onPickExisting,
  onPickNew,
}: {
  onPickExisting: () => void;
  onPickNew: () => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold tracking-wide mb-4">
          <Sparkles size={12} /> בואו נתחיל
        </div>
        <h1 className="text-3xl sm:text-4xl font-black leading-tight">
          איך תרצה להתחיל?
        </h1>
        <p className="text-white/70 mt-2 text-sm sm:text-base leading-relaxed">
          בחר את המסלול שמתאים לך — אנחנו נדאג לכל השאר.
        </p>
      </div>

      <div className="grid gap-3">
        <button
          onClick={onPickExisting}
          className="group text-right w-full p-5 rounded-2xl bg-white/[0.05] border border-white/10 hover:border-white/30 hover:bg-white/[0.09] transition flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.78_0.18_300)]/30 to-[oklch(0.65_0.22_265)]/30 grid place-items-center text-white">
            <Globe size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-base">יש לי כבר אתר</div>
            <div className="text-xs text-white/60 mt-1 leading-relaxed">
              נחפש אותו בגוגל, נאמת בעזרת מספר הטלפון של העסק, ונייבא הכל בקליק.
            </div>
          </div>
        </button>

        <button
          onClick={onPickNew}
          className="group text-right w-full p-5 rounded-2xl bg-white/[0.05] border border-white/10 hover:border-white/30 hover:bg-white/[0.09] transition flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.72_0.18_155)]/30 to-[oklch(0.65_0.22_220)]/30 grid place-items-center text-white">
            <Store size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-base">בנו לי אתר חדש</div>
            <div className="text-xs text-white/60 mt-1 leading-relaxed">
              נבחר ביחד שילוב צבעים, נציג תצוגה מקדימה ונכין את הדאשבורד שלך.
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track A — Form                                                            */
/* -------------------------------------------------------------------------- */

function AForm({
  siteUrl,
  setSiteUrl,
  urlValid,
  submitting,
  error,
  onNext,
  onNoWebsite,
}: {
  siteUrl: string;
  setSiteUrl: (v: string) => void;
  urlValid: boolean;
  submitting: boolean;
  error: string | null;
  onNext: () => void;
  onNoWebsite: () => void;
}) {
  const valid = urlValid;
  return (
    <div className="space-y-6">
      {/* HERO: URL input is the dominant action */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-6 sm:p-7">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-[11px] font-bold tracking-wide mb-3">
            <Globe size={12} /> יש לי אתר קיים
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-foreground leading-tight">
            הדבק את כתובת האתר ונסרוק אותו
          </h2>
          <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
            נמשוך את המוצרים, התמונות והעיצוב באופן אוטומטי תוך שניות.
          </p>

          <div className="mt-5">
            <div className="relative group">
              <Globe size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                ref={(el) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }}
                dir="ltr"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlValid && !submitting) onNext();
                }}
                placeholder="example.co.il"
                className={`w-full h-14 rounded-2xl bg-card border-2 pr-12 pl-4 text-base font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-4 focus:ring-primary/15 transition text-left shadow-sm ${
                  siteUrl.trim() && !urlValid
                    ? "border-destructive/60 focus:border-destructive"
                    : "border-border focus:border-primary"
                }`}
              />
            </div>
            {siteUrl.trim() && !urlValid && (
              <p className="mt-2 text-xs font-medium text-destructive">
                הזן כתובת תקינה (example.co.il)
              </p>
            )}

            <button
              disabled={!valid || submitting}
              onClick={onNext}
              className="mt-3 w-full h-14 rounded-2xl font-black text-base bg-gradient-to-l from-primary to-[var(--primary-glow)] text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="animate-spin" size={18} /> מתחיל סריקה…</>
              ) : (
                <><Search size={18} /> סרוק את האתר עכשיו</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs font-bold text-muted-foreground tracking-wider">או</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Secondary: no website */}
      <button
        type="button"
        onClick={onNoWebsite}
        disabled={submitting}
        className="group w-full text-right p-4 rounded-2xl border-2 border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all flex items-center gap-4 disabled:opacity-40"
      >
        <div className="w-12 h-12 rounded-xl bg-secondary grid place-items-center text-primary flex-shrink-0 group-hover:bg-primary/15 transition-colors">
          <Store size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-foreground">אין לי אתר — בנו לי חדש</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            תבנית פרחים מעוצבת, בחירת צבעים בקליק, עריכה בדאשבורד.
          </div>
        </div>
        <ArrowLeft size={18} className="text-muted-foreground group-hover:text-primary group-hover:-translate-x-1 transition-all flex-shrink-0" />
      </button>

      {error && <ErrorLine text={error} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track A — Searching                                                       */
/* -------------------------------------------------------------------------- */

function Searching({
  businessName,
  onCancel,
}: {
  businessName: string;
  onCancel: () => void;
}) {
  const lines = [
    "סורק את האתר שלך…",
    "מושך לוגו, צבעים ומוצרים…",
    "מכין את החנות שלך…",
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % lines.length),
      2200,
    );
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-6 text-center py-4">
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl animate-pulse" />
        <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-[var(--primary-glow)] grid place-items-center shadow-xl shadow-primary/30">
          <Loader2 size={36} className="text-primary-foreground animate-spin" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-foreground">
          {businessName ? <>מאתרים את "{businessName}"</> : "סורקים את האתר שלך"}
        </h2>
        <p className="text-muted-foreground mt-3 text-sm transition-all">{lines[idx]}</p>
      </div>
      <div className="flex justify-center gap-1.5">
        {lines.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-primary" : "w-1.5 bg-border"}`}
          />
        ))}
      </div>
      <button
        onClick={onCancel}
        className="text-xs font-bold text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        ביטול וחזרה לטופס
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track A — Site Select                                                     */
/* -------------------------------------------------------------------------- */

function SiteSelect({
  sites,
  onPick,
  onManual,
  submitting,
}: {
  sites: DiscoveredSite[];
  onPick: (s: DiscoveredSite) => void;
  onManual: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/12 text-primary text-[11px] font-bold tracking-wide mb-3">
          <Search size={12} /> בחירת אתר
        </div>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-foreground">
          מצאנו את האתרים האלה
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          איזה מהם שייך לעסק שלך?
        </p>
      </div>

      <div className="grid gap-2.5 max-h-[42vh] overflow-y-auto pr-1">
        {sites.map((s) => (
          <button
            key={s.url}
            disabled={submitting}
            onClick={() => onPick(s)}
            className="group text-right w-full p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-accent/30 transition flex items-start gap-3 disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary grid place-items-center overflow-hidden flex-shrink-0">
              {s.favicon ? (
                <img src={s.favicon} alt="" className="w-6 h-6" />
              ) : (
                <Globe size={18} className="text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate text-foreground">{s.title}</div>
              <div dir="ltr" className="text-xs text-muted-foreground mt-0.5 truncate text-right">
                {s.url}
              </div>
              {s.phone_match && (
                <div className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-primary">
                  <Check size={11} /> טלפון תואם
                </div>
              )}
            </div>
            <ArrowLeft size={16} className="text-muted-foreground group-hover:text-primary group-hover:-translate-x-1 transition-all flex-shrink-0 mt-2" />
          </button>
        ))}
      </div>

      <button
        onClick={onManual}
        className="w-full text-xs font-bold text-muted-foreground hover:text-foreground py-2 underline underline-offset-2"
      >
        האתר שלי לא ברשימה — אזין כתובת ידנית
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track A — Fallback Choice (Make scan blocked/failed)                      */
/* -------------------------------------------------------------------------- */

function FallbackChoice({
  businessName,
  reason,
  manualUrl,
  setManualUrl,
  onSubmitManual,
  onUseTemplate,
  submitting,
  error,
}: {
  businessName: string;
  reason: string | null;
  manualUrl: string;
  setManualUrl: (v: string) => void;
  onSubmitManual: () => void;
  onUseTemplate: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const headline = reason === "network_error"
    ? "לא הצלחנו להתחבר לשירות הסריקה"
    : "לא הצלחנו לאתר את המוצרים שלך אוטומטית";
  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/12 text-primary text-[11px] font-bold tracking-wide mb-3">
          <Sparkles size={12} /> איך נמשיך?
        </div>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-foreground">
          {headline}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {businessName ? <>עבור <b className="text-foreground">{businessName}</b>: </> : null}
          האתר חוסם סריקות אוטומטיות או שאין נתונים. בחר איך להמשיך — שני המסלולים מובילים לחנות אמיתית.
        </p>
      </div>

      {/* Option A — manual URL */}
      <div className="rounded-2xl bg-card border-2 border-border p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/12 text-primary grid place-items-center">
            <Globe size={18} />
          </div>
          <div className="flex-1">
            <div className="font-black text-sm text-foreground">אפשרות א׳ — הזן את כתובת האתר שלך</div>
            <div className="text-xs text-muted-foreground mt-1">
              ננסה סריקה מעמיקה ישירות מהדומיין שתספק.
            </div>
          </div>
        </div>
        <div className="relative">
          <Globe size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            dir="ltr"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="example.co.il"
            className="w-full h-12 rounded-xl bg-background border-2 border-border pr-10 pl-3 text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition text-left"
          />
        </div>
        <button
          disabled={submitting || !manualUrl.trim()}
          onClick={onSubmitManual}
          className="w-full h-12 rounded-xl font-black text-sm bg-foreground text-background hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 className="animate-spin" size={16} /> שולח…</>
          ) : (
            <><Search size={16} /> נסה סריקה</>
          )}
        </button>
      </div>

      {/* Option B — use Platform Template */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 space-y-3">
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/15 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-glow)] text-primary-foreground grid place-items-center shadow-md shadow-primary/30">
            <Store size={18} />
          </div>
          <div className="flex-1">
            <div className="font-black text-sm text-foreground">אפשרות ב׳ — התחל מהתבנית המעוצבת שלנו ✨</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              ניצור חנות חדשה עם קטלוג ועיצוב מוכן. הכל ניתן לעריכה מהדאשבורד.
            </div>
          </div>
        </div>
        <button
          disabled={submitting}
          onClick={onUseTemplate}
          className="relative w-full h-12 rounded-xl font-black text-sm bg-gradient-to-l from-primary to-[var(--primary-glow)] text-primary-foreground shadow-lg shadow-primary/30 hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 className="animate-spin" size={16} /> מקים חנות…</>
          ) : (
            <>השתמש בתבנית והמשך לדאשבורד</>
          )}
        </button>
      </div>

      {error && <ErrorLine text={error} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track A — Manual URL fallback                                             */
/* -------------------------------------------------------------------------- */

function ManualUrl({
  url,
  setUrl,
  onSubmit,
  submitting,
  error,
  timedOut,
}: {
  url: string;
  setUrl: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  timedOut: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/12 text-primary text-[11px] font-bold tracking-wide mb-3">
          <Globe size={12} /> ללא דאגות
        </div>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-foreground">
          {timedOut ? "החיפוש לוקח יותר מדי" : "לא הצלחנו לאתר את האתר אוטומטית"}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          זה בסדר! פשוט הזן את כתובת האתר שלך כאן ונמשיך.
        </p>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground mb-2 block">כתובת האתר</label>
        <div className="relative">
          <Globe size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={(el) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }}
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.co.il"
            className="w-full h-14 rounded-2xl bg-card border-2 border-border pr-12 pl-4 text-base font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition text-left"
          />
        </div>
      </div>

      <button
        disabled={submitting || !url.trim()}
        onClick={onSubmit}
        className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-l from-primary to-[var(--primary-glow)] text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="animate-spin" size={18} /> שולח…</>
        ) : (
          <><Search size={18} /> המשך</>
        )}
      </button>
      {error && <ErrorLine text={error} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Track B — Palette Picker                                                  */
/* -------------------------------------------------------------------------- */

function PalettePicker({
  paletteId,
  setPaletteId,
  useCustom,
  setUseCustom,
  customPrimary,
  setCustomPrimary,
  customAccent,
  setCustomAccent,
  onContinue,
  businessName,
  setBusinessName,
  submitting,
}: {
  paletteId: string;
  setPaletteId: (id: string) => void;
  useCustom: boolean;
  setUseCustom: (v: boolean) => void;
  customPrimary: string;
  setCustomPrimary: (v: string) => void;
  customAccent: string;
  setCustomAccent: (v: string) => void;
  onContinue: () => void;
  businessName: string;
  setBusinessName: (v: string) => void;
  submitting: boolean;
}) {
  const active = useMemo(
    () => PRESETS.find((p) => p.id === paletteId) ?? PRESETS[0],
    [paletteId],
  );
  const nameValid = businessName.trim().length >= 2;
  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/12 text-primary text-[11px] font-bold tracking-wide mb-3">
          <Palette size={12} /> שם וצבעים
        </div>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-foreground">
          איך נקרא לחנות?
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          הזן שם ובחר ערכת צבעים — תוכל לשנות הכל בהמשך מהדאשבורד.
        </p>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">שם החנות</label>
        <input
          ref={(el) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="לדוגמה: פרחי שרה"
          className="w-full h-14 rounded-2xl bg-card border-2 border-border px-4 text-base font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition text-right"
        />
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground mb-2 block">ערכת צבעים</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRESETS.map((p) => {
            const selected = !useCustom && paletteId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPaletteId(p.id)}
                className={`relative p-4 rounded-2xl border-2 transition text-right ${
                  selected
                    ? "border-primary bg-primary/8 shadow-md shadow-primary/15"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                {selected && (
                  <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground grid place-items-center">
                    <Check size={12} />
                  </div>
                )}
                <div className="flex gap-1.5 mb-3">
                  <span className="w-8 h-8 rounded-lg shadow-sm" style={{ background: p.primary }} />
                  <span className="w-8 h-8 rounded-lg shadow-sm" style={{ background: p.accent }} />
                  <span className="w-8 h-8 rounded-lg border border-border" style={{ background: p.bg }} />
                </div>
                <div className="font-bold text-sm text-foreground">{p.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => setUseCustom(!useCustom)}
        className={`w-full p-4 rounded-2xl border-2 transition text-right flex items-center gap-3 ${
          useCustom
            ? "border-primary bg-primary/8"
            : "border-border bg-card hover:border-primary/40"
        }`}
      >
        <div className="flex gap-1.5">
          <input
            type="color"
            value={customPrimary}
            onChange={(e) => { setCustomPrimary(e.target.value); setUseCustom(true); }}
            onClick={(e) => e.stopPropagation()}
            className="w-9 h-9 rounded-lg bg-transparent border border-border cursor-pointer"
            aria-label="צבע ראשי"
          />
          <input
            type="color"
            value={customAccent}
            onChange={(e) => { setCustomAccent(e.target.value); setUseCustom(true); }}
            onClick={(e) => e.stopPropagation()}
            className="w-9 h-9 rounded-lg bg-transparent border border-border cursor-pointer"
            aria-label="צבע משני"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-foreground">צבעים מותאמים אישית</div>
          <div className="text-xs text-muted-foreground mt-0.5">בחר ראשי ומשני בעצמך</div>
        </div>
      </button>

      {/* Live Preview */}
      <div className="rounded-2xl border-2 border-border overflow-hidden">
        <div className="px-4 py-2 bg-secondary text-xs font-bold text-muted-foreground border-b border-border">
          תצוגה מקדימה
        </div>
        <div className="p-5" style={{ background: useCustom ? "#ffffff" : active.bg, color: useCustom ? "#0a0a0a" : active.text }}>
          <div className="text-xl font-black mb-3">{businessName.trim() || "החנות שלך"}</div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl font-bold text-white text-sm" style={{ background: useCustom ? customPrimary : active.primary }}>
              לקטלוג המוצרים
            </button>
            <button className="px-4 py-2 rounded-xl font-bold text-sm" style={{ background: useCustom ? customAccent : active.accent, color: useCustom ? "#0a0a0a" : active.text }}>
              צור קשר
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!nameValid || submitting}
        className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-l from-primary to-[var(--primary-glow)] text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center justify-center gap-2"
      >
        {submitting ? (<><Loader2 className="animate-spin" size={18} /> מקים חנות…</>) : <>אשר והקם חנות ✨</>}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function ErrorLine({ text }: { text: string }) {
  return (
    <div className="text-xs font-bold text-destructive text-center bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2">
      {text}
    </div>
  );
}

function BackgroundFx() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,oklch(0.45_0.2_300/_0.35),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.55_0.22_220/_0.4),transparent_50%)]" />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />
      <div className="absolute top-1/4 -right-32 w-96 h-96 rounded-full bg-[oklch(0.65_0.22_300)]/30 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 -left-32 w-[28rem] h-[28rem] rounded-full bg-[oklch(0.6_0.2_220)]/25 blur-3xl" />
    </>
  );
}
