type Props = { visible: boolean; onDismiss: () => void };

export function FirstVisitOverlay({ visible, onDismiss }: Props) {
  if (!visible) return null;
  return (
    <button className="first-visit-overlay" type="button" onClick={onDismiss} aria-label="Dismiss introduction">
      <span>You&apos;re watching. He&apos;s walking. That&apos;s the whole idea.</span>
      <small>Tap to dismiss</small>
    </button>
  );
}
