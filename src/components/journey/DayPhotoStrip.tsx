import type { DayPhotoView } from "@/lib/contracts";

type Props = {
  photos: DayPhotoView[];
};

/**
 * The day's crowd photographs. Every one was taken because enough watchers
 * asked for it, so the strip stays empty until that has actually happened.
 */
export function DayPhotoStrip({ photos }: Props) {
  if (photos.length === 0) return null;
  return (
    <section className="day-photos" aria-label="Photographs the crowd asked for">
      <span className="eyebrow">TODAY’S PHOTOGRAPHS</span>
      <ul>
        {photos.slice(0, 6).map((photo) => (
          <li key={photo.atActiveSecond}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`A photograph from ${photo.atActiveSecond} watched seconds into the day`}
              loading="lazy"
              width={160}
              height={90}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
