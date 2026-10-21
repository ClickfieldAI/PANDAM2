/**
 * `/api/v1/media` — reads objects back out of the R2 media bucket.
 *
 *   GET /*   stream one object by its key
 *
 * Two kinds of object live in the bucket:
 *
 *  - Listing photos and avatars: content already visible to anyone who can see the listing.
 *    Unauthenticated and cacheable; keys are server-generated random ids, never guessable.
 *  - Chat media (`messages/…`: photos, videos, thumbnails): private to the conversation. These
 *    are served ONLY with a valid signature (`?exp=&sig=`) that the message endpoints issue to
 *    verified participants (see `lib/signedMedia.ts`). Without one the object is "not found",
 *    exactly as if it did not exist.
 *
 * Videos are served with HTTP Range support so players can stream and seek.
 * Writes live next to the entity they belong to (listing images on `/listings/:id/images`,
 * avatars on `/profiles/me/avatar`, chat media on `/conversations/:id/attachments`).
 */
import { Hono } from 'hono';

import { ApiError } from '../../../lib/http';
import { isPrivateMediaKey, verifyMediaSignature } from '../../../lib/signedMedia';
import { type AppEnv } from '../../../types';

export const mediaRoute = new Hono<AppEnv>();

/** `bytes=START-END` / `bytes=START-` / `bytes=-SUFFIX`, as R2's range option, or null. */
function parseRange(header: string | undefined): R2Range | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  return m[2] === '' ? { offset } : { offset, length: Number(m[2]) - offset + 1 };
}

mediaRoute.get('/*', async (c) => {
  if (!c.env.MEDIA) throw new ApiError('db_unavailable', 'Image storage is not configured.');

  // Everything after `/api/v1/media/` is the object key; it may contain `/`.
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/v1\/media\//, ''));
  if (!key || key.includes('..')) throw new ApiError('not_found', 'That image does not exist.');

  const isPrivate = isPrivateMediaKey(key);
  if (isPrivate) {
    const ok = await verifyMediaSignature(c.env, key, c.req.query('exp'), c.req.query('sig'));
    if (!ok) throw new ApiError('not_found', 'That image does not exist.');
  }

  const range = parseRange(c.req.header('range'));
  const object = await c.env.MEDIA.get(key, range ? { range } : undefined);
  if (!object) throw new ApiError('not_found', 'That image does not exist.');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set(
    'cache-control',
    // Public objects never change in place, so they cache for a year. Private ones are cached
    // only by the one person's device, for about as long as their signed URL lives.
    isPrivate ? 'private, max-age=3600' : 'public, max-age=31536000, immutable',
  );

  if (range && 'range' in object && object.range) {
    const r = object.range as { offset?: number; length?: number };
    const start = r.offset ?? 0;
    const length = r.length ?? object.size - start;
    headers.set('content-range', `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
});
