type Props = { cityName: string; countryName: string; packId: string; startsAt: string };

export function TomorrowPreview({ cityName, countryName, packId, startsAt }: Props) {
  const href = `/api/calendar?pack=${encodeURIComponent(packId)}&startsAt=${encodeURIComponent(startsAt)}`;
  return <aside className="tomorrow-preview" aria-label={`Tomorrow: ${cityName}, ${countryName}`}><span>Tomorrow</span><strong>{cityName}</strong><a href={href} download>Add to calendar</a></aside>;
}
