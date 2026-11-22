import { createFileRoute } from "@tanstack/react-router";
import { LegalDocView } from "@/components/LegalDocView";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "תקנון האתר ותנאי שימוש" },
    { name: "description", content: "תקנון השימוש באתר ותנאי הרכישה." },
  ]}),
  component: () => <LegalDocView slug="terms" />,
});
