type Props = {
  cityName: string;
  countryName: string;
  packId: string;
  startsAt: string;
  arrivalMode: "walk" | "train" | "flight";
};

export function TomorrowPreview({ cityName, countryName, packId, startsAt, arrivalMode }: Props) {
  const href = `/api/calendar?pack=${encodeURIComponent(packId)}&startsAt=${encodeURIComponent(startsAt)}`;
  return <aside className="tomorrow-preview" aria-label={`Tomorrow: ${cityName}, ${countryName}`}><span>Tomorrow · by {arrivalMode}</span><strong>{cityName}</strong><a href={href} download>Add to calendar</a></aside>;
}
