/**
 * Links that open a shared location in the person's own maps app. Pure (no React Native), so the
 * exact URLs are unit-tested.
 *
 *  - Android: a `geo:` URI. The system shows (or uses) whichever maps app the person prefers.
 *  - iOS: Apple Maps' universal link; Google Maps' web link is the fallback.
 *  - Web / anything else: Google Maps' documented search URL, which also opens the Google Maps
 *    app on a phone that has it.
 */
export interface MapPoint {
  latitude: number;
  longitude: number;
  placeName?: string | null;
}

export type MapPlatform = 'ios' | 'android' | 'web' | 'other';

const coord = (n: number) => Number(n.toFixed(6)).toString();
const pair = (p: MapPoint) => `${coord(p.latitude)},${coord(p.longitude)}`;

/** The web link every platform can fall back to. */
export function googleMapsUrl(p: MapPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pair(p))}`;
}

/** Links to try, best first. The last one always works in a browser. */
export function mapLinks(p: MapPoint, platform: MapPlatform): string[] {
  const label = p.placeName?.trim();
  if (platform === 'android') {
    const q = label ? `${pair(p)}(${encodeURIComponent(label)})` : pair(p);
    return [`geo:${pair(p)}?q=${q}`, googleMapsUrl(p)];
  }
  if (platform === 'ios') {
    const q = label ? `&q=${encodeURIComponent(label)}` : '';
    return [`https://maps.apple.com/?ll=${pair(p)}${q}`, googleMapsUrl(p)];
  }
  return [googleMapsUrl(p)];
}

/** "12.9716, 77.5946" for display. */
export function formatCoordinates(p: MapPoint): string {
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}
