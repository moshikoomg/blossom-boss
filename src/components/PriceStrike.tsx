/**
 * Inline price with a diagonal strikethrough.
 * Used to display the original (pre-sale) price next to the sale price.
 */
export function PriceStrike({ value, className = "" }: { value: number | string; className?: string }) {
  return (
    <span className={`price-strike-diagonal text-muted-foreground ${className}`}>₪{value}</span>
  );
}
