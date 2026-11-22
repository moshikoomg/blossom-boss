import { supabase } from "@/integrations/supabase/client";

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = {
  id: string;
  slug: string;
  title: string;
  intro: string;
  sections: LegalSection[];
  updated_at: string;
};

export async function fetchLegal(slug: "terms" | "privacy"): Promise<LegalDoc | null> {
  const { data } = await (supabase as any).from("legal_documents").select("*").eq("slug", slug).maybeSingle();
  return (data as LegalDoc) ?? null;
}
