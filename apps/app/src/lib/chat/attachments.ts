/**
 * Chat attachment rules the app checks BEFORE uploading, so a person gets a clear message at once
 * instead of waiting for a large upload to be refused. The server enforces the same limits again
 * from the file's own bytes (`apps/worker/src/lib/media.ts`); these are the friendly first line.
 * Pure (no React Native), unit-tested.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

export type MediaKind = 'image' | 'video';

export interface PickedMedia {
  kind: MediaKind;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

const IMAGE_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};
const VIDEO_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const extensionOf = (name: string | null | undefined) =>
  name && name.includes('.') ? name.split('.').pop()!.split('?')[0]!.toLowerCase() : '';

/** The content type to upload under: the picker's if it gave one, else from the extension. */
export function mediaType(m: PickedMedia): string {
  if (m.mimeType && m.mimeType.startsWith(`${m.kind}/`)) return m.mimeType;
  const table = m.kind === 'image' ? IMAGE_EXT : VIDEO_EXT;
  const ext = extensionOf(m.fileName) || extensionOf(m.uri);
  return table[ext] ?? (m.kind === 'image' ? 'image/jpeg' : 'video/mp4');
}

/** A file name with a sensible extension for what is being uploaded. */
export function mediaFileName(m: PickedMedia): string {
  const ext = extensionOf(m.fileName) || extensionOf(m.uri);
  const table = m.kind === 'image' ? IMAGE_EXT : VIDEO_EXT;
  const safe = ext in table ? ext : m.kind === 'image' ? 'jpg' : 'mp4';
  return `${m.kind}.${safe}`;
}

/** A message for the person, or null when the file is fine to send. */
export function checkPickedMedia(m: PickedMedia): string | null {
  const ext = extensionOf(m.fileName) || extensionOf(m.uri);
  const table = m.kind === 'image' ? IMAGE_EXT : VIDEO_EXT;
  const mime = m.mimeType?.toLowerCase();
  // Judge by what the picker told us: its content type, else the file extension. With neither
  // (an opaque `content://` URI) there is nothing to object to; the server checks the real bytes.
  const okType = mime ? Object.values(table).includes(mime) : ext ? ext in table : true;
  if (!okType) {
    return m.kind === 'image'
      ? 'Please choose a JPEG, PNG, WebP or HEIC photo.'
      : 'Please choose an MP4, MOV or WebM video.';
  }
  const limit = m.kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (typeof m.fileSize === 'number' && m.fileSize > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return `${m.kind === 'image' ? 'Photos' : 'Videos'} must be ${mb} MB or smaller. This one is ${(
      m.fileSize /
      (1024 * 1024)
    ).toFixed(1)} MB.`;
  }
  return null;
}
