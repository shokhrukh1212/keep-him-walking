type Props = {
  soundEnabled: boolean;
  soundAvailable: boolean;
  reducedMotion: boolean;
  onToggleSound: () => void;
  onToggleMotion: () => void;
};

export function SoundMotionControls({
  soundEnabled,
  soundAvailable,
  reducedMotion,
  onToggleSound,
  onToggleMotion,
}: Props) {
  return (
    <div className="utility-controls">
      <button type="button" onClick={onToggleSound} aria-pressed={soundEnabled}>
        {soundAvailable ? (soundEnabled ? "Sound on" : "Sound off") : "Sound unavailable"}
      </button>
      <button type="button" onClick={onToggleMotion} aria-pressed={reducedMotion}>
        {reducedMotion ? "Motion reduced" : "Full motion"}
      </button>
    </div>
  );
}
