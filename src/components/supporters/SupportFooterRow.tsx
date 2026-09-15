type Props = {
  coffeeUrl: string | null;
  onSupportersOpen: () => void;
};

export function SupportFooterRow({ coffeeUrl, onSupportersOpen }: Props) {
  return <nav className="support-footer-row" aria-label="Support the journey">
    {coffeeUrl ? <a href={coffeeUrl} target="_blank" rel="noopener noreferrer">☕ Buy him a coffee</a> : (
      <span aria-disabled="true" title="The owner has not configured the Buy Me a Coffee profile yet.">☕ Buy him a coffee</span>
    )}
    <button type="button" aria-haspopup="dialog" onClick={onSupportersOpen}>Supporters</button>
  </nav>;
}
