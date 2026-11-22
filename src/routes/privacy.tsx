import { createFileRoute } from "@tanstack/react-router";
import { LegalDocView } from "@/components/LegalDocView";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "מדיניות פרטיות" },
    { name: "description", content: "מדיניות הפרטיות של האתר." },
  ]}),
  component: () => <LegalDocView slug="privacy" />,
});
