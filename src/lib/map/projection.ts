export const MAP_WIDTH = 1_000;
export const MAP_HEIGHT = 500;

export type GeoPoint = { lat: number; lon: number };
export type MapPoint = { x: number; y: number };

/** Pure equirectangular projection matching public/map/world.svg. */
export function projectEquirectangular(point: GeoPoint): MapPoint {
  const lat = Math.min(90, Math.max(-90, point.lat));
  const lon = Math.min(180, Math.max(-180, point.lon));
  return {
    x: (lon + 180) / 360 * MAP_WIDTH,
    y: (90 - lat) / 180 * MAP_HEIGHT,
  };
}

/** SVG point string with stable precision for server and browser rendering. */
export function mapPointString(point: GeoPoint) {
  const projected = projectEquirectangular(point);
  return `${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
}
