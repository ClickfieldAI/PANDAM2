import { boundedString, z } from './common';

/** A shared place. Coordinates are WGS84 degrees; `placeName` is optional human-readable text. */
export const locationShareSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeName: boundedString(1, 200).optional(),
});
export type LocationShareInput = z.infer<typeof locationShareSchema>;

/**
 * A message needs text, a photo, a video or a shared location � never none. Kinds are not
 * mixed arbitrarily: a video may carry a thumbnail photo (`imageKey`) and a caption, a
 * location may carry a caption, but a location is never combined with media.
 * `body` stays optional at the schema level so the "must have one of these" rule lives in
 * the one `refine` below rather than being encoded twice.
 */
export const createMessageSchema = z
  .object({
    body: boundedString(0, 4000).optional(),
    imageKey: z.string().trim().min(1).optional(),
    /** Uploaded video (see `POST /conversations/:id/attachments/video`). */
    videoKey: z.string().trim().min(1).optional(),
    location: locationShareSchema.optional(),
    /** Retry id chosen by the sender's app (8-80 chars); a repeat returns the stored message. */
    clientId: z.string().trim().min(8).max(80).optional(),
  })
  .refine((v) => !!v.body?.trim() || !!v.imageKey || !!v.videoKey || !!v.location, {
    message: 'A message needs text, a photo, a video or a location.',
    path: ['body'],
  })
  .refine((v) => !v.location || (!v.imageKey && !v.videoKey), {
    message: 'A location cannot be sent together with a photo or video.',
    path: ['location'],
  });
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const setTypingSchema = z.object({
  typing: z.boolean(),
});
export type SetTypingInput = z.infer<typeof setTypingSchema>;
