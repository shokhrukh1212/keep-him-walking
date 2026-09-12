type Props = {
  enabled: boolean;
  available: boolean;
  /** The visitor turned sound on before; it resumes on their first tap. */
  resumesOnTap: boolean;
  onToggle: () => void;
};

export function SoundToggle({ enabled, available, resumesOnTap, onToggle }: Props) {
  const label = !available
    ? "Sound unavailable"
    : enabled
      ? "Sound on"
      : resumesOnTap
        ? "Sound off, resumes on your first tap"
        : "Sound off";
  return (
    <button
      type="button"
      className="sound-toggle"
      data-state={enabled ? "on" : "off"}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      disabled={!available}
      onClick={onToggle}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
        <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
        {enabled ? (
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
