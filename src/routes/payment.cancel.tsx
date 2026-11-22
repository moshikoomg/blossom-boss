import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";

export const Route = createFileRoute("/payment/cancel")({
  head: () => ({ meta: [{ title: "תשלום בוטל" }] }),
  component: () => (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="bg-card border border-border rounded-3xl p-8 max-w-md w-full text-center">
        <XCircle className="mx-auto text-rose-500 mb-4" size={64}/>
        <h1 className="text-2xl font-black mb-2">התשלום בוטל</h1>
        <p className="text-muted-foreground text-sm mb-6">לא חויבת. אפשר לנסות שוב.</p>
        <Link to="/cart" className="block bg-primary text-primary-foreground font-bold py-3 rounded-xl">חזרה לסל</Link>
      </div>
    </div>
  ),
});
