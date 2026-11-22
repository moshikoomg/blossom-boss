import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, ShoppingCart, Sparkles, Loader2, ExternalLink, ZoomIn, Minimize2, ArrowRight } from "lucide-react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { salesChat, getChatViewerMode } from "@/lib/sales-chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useStore } from "@/lib/store-context";
import { toast } from "sonner";
import { isAiChatEnabled, AI_CHAT_CHANGED_EVENT } from "@/components/OnboardingSequencer";

type Msg = { role: "user" | "assistant"; content: string };
type Product = { id: string; name: string; price: number; image_url: string; description: string };
type Addon = { id: string; name: string; price: number; image_url: string };
type Size = { label: string; price: number };

const STORAGE_KEY = "tmm_sales_chat_v2";
const WELCOME: Msg = { role: "assistant", content: "שלום! אני תמר 🌷 המוכרן הדיגיטלי. לאיזה אירוע מחפשים זר?" };
const DEFAULT_REPLIES = ["אהבה ❤️", "יום הולדת 🎂", "ניחומים 🤍", "סתם פינוק 🌸"];

type Saved = {
  messages: Msg[];
  productId: string | null;
  candidateIds: string[];
  addonIds: string[];
  sizeLabel: string | null;
  quickReplies: string[];
  selectedAddons: Record<string, boolean>;
  selectedSize: string | null;
};

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function SalesChatBot() {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // The chatbot is hidden on the storefront until the merchant explicitly
  // opts in during onboarding. Owners (admin context) always see it for QA.
  const [enabled, setEnabled] = useState<boolean>(() => isAiChatEnabled());
  useEffect(() => {
    const sync = () => setEnabled(isAiChatEnabled());
    window.addEventListener(AI_CHAT_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AI_CHAT_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const saved = typeof window !== "undefined" ? loadSaved() : null;
  const [messages, setMessages] = useState<Msg[]>(saved?.messages?.length ? saved.messages : [WELCOME]);
  const [productId, setProductId] = useState<string | null>(saved?.productId ?? null);
  const [product, setProduct] = useState<Product | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>(saved?.candidateIds ?? []);
  const [candidates, setCandidates] = useState<Product[]>([]);
  // Cross-sell / complementary picks shown beneath the focused product —
  // small quick-add cards (e.g. "vase, chocolate, card" when the user picks
  // a bouquet). Loaded automatically whenever `applyProduct` runs.
  const [crossSell, setCrossSell] = useState<Product[]>([]);
  const [addonIds, setAddonIds] = useState<string[]>(saved?.addonIds ?? []);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [selectedSize, setSelectedSize] = useState<string | null>(saved?.selectedSize ?? null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>(saved?.selectedAddons ?? {});
  const [quickReplies, setQuickReplies] = useState<string[]>(saved?.quickReplies ?? DEFAULT_REPLIES);

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatFn = useServerFn(salesChat);
  const viewerModeFn = useServerFn(getChatViewerMode);
  const { store } = useStore();
  const { add } = useCart();
  const nav = useNavigate();

  // null = unknown (still resolving). Default to "visitor" until proven owner.
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [greeting, setGreeting] = useState("");

  // Resolve viewer role once the chat opens — cheap, no AI cost.
  useEffect(() => {
    if (!open || isOwner !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await viewerModeFn({ data: { storeId: store?.id ?? null } });
        if (!cancelled) setIsOwner(!!res.isOwner);
      } catch {
        if (!cancelled) setIsOwner(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, store?.id, isOwner, viewerModeFn]);

  // For visitors: when chat opens with no product/candidates, seed a small
  // catalogue carousel directly from the DB so they can still pick a product
  // and attach a greeting card. We never call the AI for visitors.
  useEffect(() => {
    if (!open || isOwner !== false) return;
    if (product || candidates.length || candidateIds.length) return;
    let cancelled = false;
    (async () => {
      const q = supabase
        .from("products")
        .select("id,name,price,image_url,description")
        .eq("active", true)
        .order("rating", { ascending: false })
        .limit(6);
      const { data } = await q;
      if (cancelled || !data) return;
      setCandidateIds(data.map((p: any) => p.id));
      setCandidates(data as Product[]);
    })();
    return () => { cancelled = true; };
  }, [open, isOwner, product, candidates.length, candidateIds.length]);

  // Persist
  useEffect(() => {
    try {
      const data: Saved = { messages, productId, candidateIds, addonIds, sizeLabel: null, quickReplies, selectedAddons, selectedSize };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [messages, productId, candidateIds, addonIds, quickReplies, selectedAddons, selectedSize]);

  // Hydrate product/addons from saved IDs
  useEffect(() => {
    (async () => {
      if (productId && !product) {
        const { data } = await supabase.from("products").select("id,name,price,image_url,description").eq("id", productId).maybeSingle();
        if (data) setProduct(data as Product);
        const { data: sz } = await supabase.from("product_sizes").select("label,price").eq("product_id", productId).order("display_order");
        setSizes((sz || []) as Size[]);
      }
      if (addonIds.length && addons.length === 0) {
        const { data } = await supabase.from("add_ons").select("id,name,price,image_url").in("id", addonIds);
        if (data) setAddons(data as Addon[]);
      }
      if (candidateIds.length && candidates.length === 0) {
        const { data } = await supabase.from("products").select("id,name,price,image_url,description").in("id", candidateIds);
        if (data) setCandidates((data as Product[]).sort((a, b) => candidateIds.indexOf(a.id) - candidateIds.indexOf(b.id)));
      }
    })();
  }, [productId, addonIds, candidateIds]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, product, open]);

  async function send(text: string, opts?: { silent?: boolean }) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Msg = { role: "user", content: trimmed };
    const next: Msg[] = opts?.silent ? [...messages, userMsg] : [...messages, userMsg];
    setMessages(opts?.silent ? messages : next);
    const sendMessages = next;
    setInput("");
    setLoading(true);
    setQuickReplies([]);
    try {
      const res = await chatFn({ data: { messages: sendMessages, storeId: store?.id ?? null } });
      // Keep viewer role in sync with the server's authoritative answer.
      if (typeof (res as any).isOwner === "boolean") setIsOwner((res as any).isOwner);
      const baseMsgs = opts?.silent ? messages : next;
      setMessages([...baseMsgs, { role: "assistant", content: res.reply }]);
      setQuickReplies(res.quickReplies?.length ? res.quickReplies : []);

      const ids = res.recommendedProductIds || [];
      if (ids.length > 1) {
        // Show carousel of candidates, clear single selection
        setCandidateIds(ids);
        setProductId(null);
        setProduct(null);
        setSizes([]);
        setSelectedSize(null);
        const { data } = await supabase.from("products").select("id,name,price,image_url,description").in("id", ids);
        if (data) setCandidates((data as Product[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
      } else if (ids.length === 1 && ids[0] !== productId) {
        await applyProduct(ids[0]);
        setCandidateIds([]); setCandidates([]);
      }
      if (res.suggestedSizeLabel) setSelectedSize(res.suggestedSizeLabel);
      if (res.suggestedAddonIds.length) {
        setAddonIds(res.suggestedAddonIds);
        const { data } = await supabase.from("add_ons").select("id,name,price,image_url").in("id", res.suggestedAddonIds);
        if (data) setAddons(data as Addon[]);
      }
    } catch (e: any) {
      // Owners see in-chat feedback so they understand what happened (e.g.
      // credits depleted). Visitors must never see a credit / API failure —
      // we silently swallow so the storefront stays polished.
      if (isOwner) toast.error(e?.message || "שגיאה בצ'אט");
    } finally {
      setLoading(false);
    }
  }

  async function applyProduct(id: string) {
    setProductId(id);
    const { data } = await supabase.from("products").select("id,name,price,image_url,description").eq("id", id).maybeSingle();
    if (data) setProduct(data as Product);
    const { data: sz } = await supabase.from("product_sizes").select("label,price").eq("product_id", id).order("display_order");
    setSizes((sz || []) as Size[]);
    setSelectedSize(null);
    setSelectedAddons({});
    // Load 3 complementary products: prefer items from OTHER categories
    // than the picked product, fall back to top-rated remaining actives.
    try {
      const picked = (data as any) || null;
      const pickedCat = picked?.category_id || null;
      let alt = await supabase
        .from("products")
        .select("id,name,price,image_url,description,category_id")
        .eq("active", true)
        .neq("id", id)
        .order("rating", { ascending: false })
        .limit(12);
      let list = (alt.data || []) as any[];
      if (pickedCat) {
        const otherCat = list.filter((p) => p.category_id && p.category_id !== pickedCat);
        if (otherCat.length >= 2) list = otherCat;
      }
      setCrossSell(list.slice(0, 3) as Product[]);
    } catch {
      setCrossSell([]);
    }
  }

  async function pickCandidate(p: Product) {
    await applyProduct(p.id);
    setCandidateIds([]); setCandidates([]);
    // Owners: ask the AI for tailored add-ons. Visitors: stay silent — the
    // greeting-card flow takes over and we don't burn AI credits on browse.
    if (isOwner) {
      send(`בחרתי ב-${p.name}. הצע לי תוספות מתאימות.`);
    }
  }

  function effectivePrice() {
    if (!product) return 0;
    const sz = sizes.find((s) => s.label === selectedSize);
    const base = sz ? sz.price : Number(product.price);
    const ext = addons.filter((a) => selectedAddons[a.id]).reduce((s, a) => s + Number(a.price), 0);
    return base + ext;
  }

  function addToCart(goCheckout: boolean) {
    if (!product) return;
    const sz = sizes.find((s) => s.label === selectedSize);
    const extras = addons.filter((a) => selectedAddons[a.id]).map((a) => ({ id: a.id, name: a.name, price: Number(a.price), qty: 1, image: a.image_url }));
    add({
      productId: product.id,
      name: product.name,
      price: sz ? sz.price : Number(product.price),
      image: product.image_url,
      qty: 1,
      sizeLabel: sz?.label,
      extras,
      cardText: greeting.trim() || undefined,
    });
    toast.success("נוסף לסל!");
    setGreeting("");
    if (goCheckout) {
      setOpen(false);
      nav({ to: "/checkout" });
    }
  }

  function reset() {
    setMessages([WELCOME]);
    setProduct(null); setProductId(null);
    setCandidates([]); setCandidateIds([]);
    setCrossSell([]);
    setAddons([]); setAddonIds([]);
    setSizes([]); setSelectedSize(null);
    setSelectedAddons({});
    setQuickReplies(DEFAULT_REPLIES);
    setGreeting("");
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // One-step back: pop the latest interaction layer instead of wiping the
  // whole conversation. Order matters — peel the deepest layer first.
  function goBack() {
    // 1. If a product is currently focused, drop it and return to the
    //    candidates carousel / previous Q&A turn.
    if (product || productId) {
      setProduct(null);
      setProductId(null);
      setSizes([]);
      setSelectedSize(null);
      setSelectedAddons({});
      setAddons([]);
      setAddonIds([]);
      setCrossSell([]);
      setGreeting("");
      return;
    }
    // 2. If a candidate carousel is visible, clear it.
    if (candidates.length || candidateIds.length) {
      setCandidates([]);
      setCandidateIds([]);
      return;
    }
    // 3. Otherwise pop the last user→assistant exchange so the user can
    //    re-answer the previous prompt. Always keep the WELCOME.
    setMessages((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      // Drop trailing assistant, then trailing user, if present.
      if (next[next.length - 1]?.role === "assistant") next.pop();
      if (next.length > 1 && next[next.length - 1]?.role === "user") next.pop();
      return next;
    });
    setQuickReplies(DEFAULT_REPLIES);
  }

  const canGoBack =
    !!product ||
    !!productId ||
    candidates.length > 0 ||
    candidateIds.length > 0 ||
    messages.length > 1;

  // Hide the chatbot completely for non-owners until the merchant has
  // opted in via the onboarding sequence. Owners always see it so they
  // can preview / QA without flipping the flag.
  if (!enabled && isOwner !== true) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="מוכרן דיגיטלי"
        className="pop-bounce-in fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.25)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Bot size={26} />
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center ring-2 ring-background">
          <Sparkles size={10} className="text-amber-900" />
        </span>
      </button>

      {open && (
        <div dir="rtl" className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm flex items-end md:items-center md:justify-end" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full md:w-[440px] md:h-[680px] md:m-6 md:rounded-3xl bg-gradient-to-b from-card to-background border border-border shadow-2xl flex flex-col overflow-hidden h-[92vh] rounded-t-3xl animate-in slide-in-from-bottom md:slide-in-from-right duration-200"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-gradient-to-l from-primary/15 via-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md">
                  <Bot size={20} className="text-primary-foreground" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-card" />
                </div>
                <div>
                  <p className="font-black text-sm leading-tight">תמר · מוכרן דיגיטלי</p>
                  <p className="text-[10px] text-muted-foreground">זמין עכשיו · מענה מיידי</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canGoBack && (
                  <button
                    onClick={goBack}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition"
                    title="חזרה שלב אחד אחורה"
                    aria-label="חזור שלב אחד"
                  >
                    <ArrowRight size={12} /> חזור
                  </button>
                )}
                <button onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition" title="התחל שיחה חדשה">
                  שיחה חדשה
                </button>
                <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center" aria-label="סגור">
                  <X size={18} />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[82%] px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : "bg-card border border-border/60 text-foreground rounded-2xl rounded-bl-md"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-end">
                  <div className="bg-card border border-border/60 px-4 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
                  </div>
                </div>
              )}

              {candidates.length > 0 && !product && (
                <div className="bg-card border-2 border-primary/30 rounded-3xl p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-primary mb-2 px-1">
                    <Sparkles size={12} /> בחרו את האהוב עליכם:
                  </div>
                  <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
                    {candidates.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => pickCandidate(c)}
                        className="shrink-0 w-44 rounded-2xl border-2 border-border bg-background overflow-hidden text-right hover:border-primary hover:shadow-md transition snap-start"
                      >
                        {c.image_url ? (
                          <img src={c.image_url} alt={c.name} className="w-full h-36 object-cover" />
                        ) : (
                          <div className="w-full h-36 bg-muted" />
                        )}
                        <div className="p-2">
                          <p className="font-black text-xs truncate">{c.name}</p>
                          {c.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{c.description}</p>}
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-primary font-black text-sm">₪{Number(c.price)}</span>
                            <span className="text-[10px] font-bold text-primary/80">בחר ←</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {product && (
                <div className="bg-card border-2 border-primary/30 rounded-3xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2">
                  <div className="relative">
                    {product.image_url && (
                      <>
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-56 object-cover cursor-zoom-in"
                          onClick={() => setZoom(true)}
                        />
                        <button
                          onClick={() => setZoom(true)}
                          className="absolute top-2 left-2 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
                          aria-label="הגדל"
                        >
                          <ZoomIn size={16} />
                        </button>
                        <Link
                          to="/products/$productId"
                          params={{ productId: product.id }}
                          onClick={() => setOpen(false)}
                          className="absolute top-2 right-2 px-3 h-9 rounded-full bg-white/95 text-foreground text-xs font-bold flex items-center gap-1 hover:bg-white shadow"
                        >
                          לדף המוצר <ExternalLink size={12} />
                        </Link>
                      </>
                    )}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full">
                      <Sparkles size={11} /> ההמלצה שלי
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <p className="font-black text-base leading-tight">{product.name}</p>
                      {product.description && <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>}
                    </div>

                    {sizes.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold mb-1.5 text-muted-foreground">בחרו גודל:</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {sizes.map((s) => {
                            const sel = selectedSize === s.label;
                            return (
                              <button
                                key={s.label}
                                onClick={() => setSelectedSize(sel ? null : s.label)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${
                                  sel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"
                                }`}
                              >
                                {s.label} · ₪{s.price}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {addons.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold mb-1.5 text-muted-foreground">תוספות מומלצות (לחיצה לבחירה):</p>
                        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
                          {addons.map((a) => {
                            const sel = !!selectedAddons[a.id];
                            return (
                              <button
                                key={a.id}
                                onClick={() => setSelectedAddons((s) => ({ ...s, [a.id]: !s[a.id] }))}
                                className={`shrink-0 w-28 rounded-2xl border-2 overflow-hidden text-center transition snap-start ${
                                  sel ? "border-primary bg-primary/10 scale-[0.98]" : "border-border bg-background hover:border-primary/40"
                                }`}
                              >
                                {a.image_url ? (
                                  <img src={a.image_url} alt={a.name} className="w-full aspect-square object-cover" />
                                ) : (
                                  <div className="w-full aspect-square bg-muted" />
                                )}
                                <div className="p-1.5">
                                  <p className="text-[11px] font-bold truncate">{a.name}</p>
                                  <p className="text-[11px] text-primary font-black">+₪{Number(a.price)}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border/60">
                      <span className="text-[11px] text-muted-foreground">סה״כ</span>
                      <span className="font-black text-lg text-primary">₪{effectivePrice()}</span>
                    </div>

                    {crossSell.length > 0 && (
                      <div className="pt-1">
                        <p className="text-[11px] font-bold mb-1.5 text-muted-foreground flex items-center gap-1">
                          <Sparkles size={11} className="text-primary" />
                          הולך מעולה עם:
                        </p>
                        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
                          {crossSell.map((c) => (
                            <div
                              key={c.id}
                              className="shrink-0 w-32 rounded-2xl border-2 border-border bg-background overflow-hidden text-right snap-start hover:border-primary/50 transition"
                            >
                              {c.image_url ? (
                                <img src={c.image_url} alt={c.name} className="w-full h-20 object-cover" />
                              ) : (
                                <div className="w-full h-20 bg-muted" />
                              )}
                              <div className="p-1.5">
                                <p className="text-[11px] font-bold truncate">{c.name}</p>
                                <div className="flex items-center justify-between mt-1 gap-1">
                                  <span className="text-primary font-black text-[11px]">
                                    ₪{Number(c.price)}
                                  </span>
                                  <button
                                    onClick={() => {
                                      add({
                                        productId: c.id,
                                        name: c.name,
                                        price: Number(c.price),
                                        image: c.image_url,
                                        qty: 1,
                                        extras: [],
                                      });
                                      toast.success("נוסף לסל!");
                                    }}
                                    className="inline-flex items-center gap-0.5 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black px-2 py-1 rounded-full"
                                    aria-label={`הוסף לסל ${c.name}`}
                                  >
                                    <ShoppingCart size={10} /> הוסף
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isOwner === false && (
                      <div>
                        <p className="text-[11px] font-bold mb-1.5 text-muted-foreground">ברכה אישית לכרטיס (אופציונלי):</p>
                        <textarea
                          value={greeting}
                          onChange={(e) => setGreeting(e.target.value.slice(0, 300))}
                          placeholder="לדוגמה: מזל טוב, באהבה רבה..."
                          rows={2}
                          className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm outline-none focus:border-primary transition resize-none"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => addToCart(false)} className="flex items-center justify-center gap-1 bg-secondary hover:bg-secondary/70 text-xs font-bold py-2.5 rounded-xl">
                        <ShoppingCart size={14} /> הוסף לסל
                      </button>
                      <button onClick={() => addToCart(true)} className="flex items-center justify-center gap-1 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:opacity-90 text-xs font-black py-2.5 rounded-xl shadow">
                        לתשלום ←
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isOwner !== false && quickReplies.length > 0 && !loading && (
              <div className="px-3 pb-2 flex gap-2 flex-wrap">
                {quickReplies.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => send(q)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {isOwner === false ? (
              <div className="border-t border-border/60 p-3 bg-card/80 backdrop-blur text-center text-[12px] text-muted-foreground">
                💡 בחרו מוצר מהמומלצים והוסיפו ברכה אישית לכרטיס
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); send(input); }}
                className="border-t border-border/60 p-2.5 flex items-center gap-2 bg-card/80 backdrop-blur"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="כתבו הודעה..."
                  className="flex-1 bg-background border border-input rounded-full px-4 py-2.5 text-sm outline-none focus:border-primary transition"
                  disabled={loading}
                />
                <button type="submit" disabled={loading || !input.trim()} className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:scale-105 transition">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            )}
          </div>

          {zoom && product?.image_url && (
            <div
              className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
              onClick={(e) => { e.stopPropagation(); setZoom(false); }}
            >
              <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain rounded-xl" />
              <button
                onClick={(e) => { e.stopPropagation(); setZoom(false); }}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
              >
                <Minimize2 size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
