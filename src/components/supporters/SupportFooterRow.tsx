type Props = {
  coffeeUrl: string | null;
};

export function SupportFooterRow({ coffeeUrl }: Props) {
  return <nav className="support-footer-row" aria-label="Support the journey">
    {coffeeUrl ? <a href={coffeeUrl} target="_blank" rel="noopener noreferrer">☕ Buy him a coffee</a> : (
      <span aria-disabled="true" title="The owner has not configured the Buy Me a Coffee profile yet.">☕ Buy him a coffee</span>
    )}
  </nav>;
}
