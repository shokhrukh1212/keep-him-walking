type Props = {
  soundEnabled: boolean;
  soundAvailable: boolean;
  onToggleSound: () => void;
};

export function SoundMotionControls({
  soundEnabled,
  soundAvailable,
  onToggleSound,
}: Props) {
  return (
    <div className="utility-controls">
      <button type="button" onClick={onToggleSound} aria-pressed={soundEnabled}>
        {soundAvailable ? (soundEnabled ? "Sound on" : "Sound off") : "Sound unavailable"}
      </button>
    </div>
  );
}
