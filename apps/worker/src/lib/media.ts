/**
 * Image upload helpers for the R2 media bucket.
 *
 * Everything user-uploaded goes through here so the rules live in one place:
 * a strict content-type allowlist, a hard size cap, and a server-generated
 * object key. The client never chooses the key — it only ever sends bytes —
 * so a caller cannot overwrite somebody else's object or escape its prefix.
 */
import { ApiError } from './http';
import { log } from './log';

/** 8 MB. Phone cameras exceed this only for uncompressed originals. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 40 MB: a short phone clip. Larger files are refused before anything is stored. */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Image formats recognised by their file signature ("magic bytes"). */
export type SniffedImage = { contentType: string; extension: string };

const ascii = (view: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...view.subarray(from, to));

/**
 * Identify an image from its first bytes, ignoring whatever the client claimed.
 * Returns null for anything that is not a JPEG, PNG, WebP or HEIC/HEIF image
 * (an HTML page, a script, a PDF or a renamed text file all land here).
 */
export function sniffImage(bytes: ArrayBuffer): SniffedImage | null {
  const v = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16));
  if (v.length >= 3 && v[0] === 0xff && v[1] === 0xd8 && v[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (
    v.length >= 8 &&
    v[0] === 0x89 &&
    ascii(v, 1, 4) === 'PNG' &&
    v[4] === 0x0d &&
    v[5] === 0x0a &&
    v[6] === 0x1a &&
    v[7] === 0x0a
  ) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (v.length >= 12 && ascii(v, 0, 4) === 'RIFF' && ascii(v, 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  if (v.length >= 12 && ascii(v, 4, 8) === 'ftyp') {
    const brand = ascii(v, 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) {
      return { contentType: 'image/heic', extension: 'heic' };
    }
    if (['mif1', 'msf1'].includes(brand)) {
      return { contentType: 'image/heif', extension: 'heif' };
    }
  }
  return null;
}

export interface UploadedImage {
  bytes: ArrayBuffer;
  contentType: string;
  extension: string;
}

/**
 * Pull a single image out of a `multipart/form-data` body under the field
 * `file`. Multipart (rather than a raw binary body) is what React Native's
 * `FormData` can send for a `file://` URI on both native and web without any
 * extra filesystem dependency.
 */
export async function readUploadedImage(request: Request): Promise<UploadedImage> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError('bad_request', 'Expected a multipart/form-data body with a `file` field.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new ApiError('validation_error', 'No image was uploaded.', { file: ['is required'] });
  }

  // The declared `File.type` is NOT used to accept or reject: it is client-controlled,
  // and some Android clients send multipart parts with an empty or generic type
  // ("application/octet-stream") even for a perfectly good JPEG. The file's own
  // signature, checked below, is the only authority.
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError('unprocessable', 'Images must be 8 MB or smaller.', {
      file: ['too large'],
    });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new ApiError('unprocessable', 'That image file was empty.', { file: ['is empty'] });
  }
  // The file's own signature decides what it is. A text/HTML/script payload
  // labelled "image/png" is refused, and what we STORE and later serve is the
  // type the bytes really are, never the client's claim.
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    // Say WHY in the log (never the content): enough to tell a client that sent the wrong
    // thing from a format we do not support.
    log('warn', 'upload.rejected', {
      declaredType: file.type,
      size: bytes.byteLength,
      head: Array.from(new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength)))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join(' '),
    });
    throw new ApiError('unprocessable', 'That file is not a valid JPEG, PNG, WebP or HEIC image.', {
      file: ['not a recognised image'],
    });
  }
  return { bytes, contentType: sniffed.contentType, extension: sniffed.extension };
}

/** Video formats recognised by their file signature. */
export type SniffedVideo = { contentType: string; extension: string };

/**
 * Identify a video from its first bytes: MP4/M4V/3GP and QuickTime (`ftyp` box) or WebM
 * (EBML header). HEIC/HEIF/AVIF still images also use `ftyp`, so their brands are excluded.
 */
export function sniffVideo(bytes: ArrayBuffer): SniffedVideo | null {
  const v = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16));
  if (v.length >= 4 && v[0] === 0x1a && v[1] === 0x45 && v[2] === 0xdf && v[3] === 0xa3) {
    return { contentType: 'video/webm', extension: 'webm' };
  }
  if (v.length >= 12 && ascii(v, 4, 8) === 'ftyp') {
    const brand = ascii(v, 8, 12);
    const imageBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif'];
    if (imageBrands.includes(brand)) return null;
    if (brand === 'qt  ') return { contentType: 'video/quicktime', extension: 'mov' };
    return { contentType: 'video/mp4', extension: 'mp4' };
  }
  return null;
}

export interface UploadedVideo {
  bytes: ArrayBuffer;
  contentType: string;
  extension: string;
}

/** Pull one video out of a `multipart/form-data` body (field `file`), validated like images. */
export async function readUploadedVideo(request: Request): Promise<UploadedVideo> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError('bad_request', 'Expected a multipart/form-data body with a `file` field.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new ApiError('validation_error', 'No video was uploaded.', { file: ['is required'] });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new ApiError('unprocessable', 'Videos must be 40 MB or smaller.', {
      file: ['too large'],
    });
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new ApiError('unprocessable', 'That video file was empty.', { file: ['is empty'] });
  }
  const sniffed = sniffVideo(bytes);
  if (!sniffed) {
    throw new ApiError('unprocessable', 'That file is not a valid MP4, MOV or WebM video.', {
      file: ['not a recognised video'],
    });
  }
  return { bytes, contentType: sniffed.contentType, extension: sniffed.extension };
}

/** The R2 bucket, or a clear 503 when the binding is not configured. */
export function requireMedia(env: { MEDIA?: R2Bucket }): R2Bucket {
  if (!env.MEDIA) {
    throw new ApiError(
      'db_unavailable',
      'Image storage is not configured on this server (the MEDIA R2 binding is missing).',
    );
  }
  return env.MEDIA;
}

/**
 * Public path the app fetches an object back through. Relative on purpose —
 * the client already knows the API origin, and hardcoding one here would
 * break preview deployments.
 */
export function mediaUrl(objectKey: string): string {
  return `/api/v1/media/${objectKey}`;
}
