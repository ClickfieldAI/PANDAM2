# Contact (Message / Call / WhatsApp), mobile numbers and chat media

## Who can contact whom

A conversation only exists once the recipient **accepts** an offer, so before acceptance there is no chat and no
contact at all. After acceptance each person sees a Message / Call / WhatsApp row (chat header and accepted-offer
screen). Call and WhatsApp are enforced on the server:

- `GET /api/v1/conversations/:id/contact` returns the **other** participant's number, and only while all of these hold
  (`apps/worker/src/services/contact.ts`): the caller is in the conversation, the offer is `accepted`, its barter
  transaction is `created`, `in_progress` or `disputed` (not `cancelled` or `completed`), the conversation is not
  archived, neither person has blocked the other, and the other account is active. Anything else is `403`
  (a stranger gets `404`, like any other chat read).
- `ConversationView.canContact` carries the same answer (without the number) so the UI knows whether to draw the
  buttons. Accepting one trade reveals nothing about any other trade.

Call opens the device dialer with `tel:+<E.164>`; WhatsApp tries `whatsapp://send?phone=<digits>` then the official
`https://wa.me/<digits>` (browser fallback). Neither pre-fills text, so nothing is sent for the user.

## Mobile number

- Stored once per account in `profiles.phone_e164` (E.164, e.g. `+919876543210`). Private: not part of any public
  profile, listing, search or match response.
- Required when creating a listing or a request: `phone` in `POST /listings` / `POST /needs` (or a number already
  saved on the profile). Missing or invalid is `422` with `details.phone`. A newly supplied number replaces the saved one.
- `GET/PUT /api/v1/profiles/me/phone` read/set your own number.
- Parsing and link building (`normalizePhone`, `buildPhone`, `telUrl`, `whatsappUrl`) are in
  `packages/validation/src/phone.ts`, shared by the app form and the Worker.
- There is no phone **verification** (no OTP) yet: a number is whatever the user entered.

## Chat attachments

| Kind     | How                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo    | `POST /conversations/:id/attachments` (multipart `file`, JPEG/PNG/WebP/HEIC, 8 MB) then `imageKey`                                                              |
| Video    | `POST /conversations/:id/attachments/video` (MP4/MOV/WebM, 40 MB, checked from the bytes) then `videoKey`; the app also uploads a thumbnail photo as `imageKey` |
| Location | `location: { latitude, longitude, placeName? }` in `POST /conversations/:id/messages` (no upload)                                                               |

Objects go to the existing R2 bucket under `messages/<uploaderId>/<uuid>.<ext>`; the database keeps only the keys and
coordinates (`messages.video_key`, `latitude`, `longitude`, `place_name`; migration `0021`). A message can only reference
keys under its own sender's prefix.

**Private media.** Everything under `messages/` is served by `GET /api/v1/media/*` only with a valid signature
(`?exp=&sig=`, HMAC-SHA256, `lib/signedMedia.ts`). Signed URLs are minted only inside the message endpoints after the
participant check, are valid for 1-2 hours and are stable within the hour (so polling does not re-download). Listing
photos and avatars stay public. Range requests are supported so videos can stream and seek.

## Configuration

- `MEDIA_URL_SECRET` (Worker secret) signs private media URLs. **Required outside development**: without it chat media
  URLs cannot be issued. Local dev has a built-in fallback. `wrangler secret put MEDIA_URL_SECRET`.
- App: `expo-location`, `expo-video`, `expo-video-thumbnails` (installed); permission strings are in `app.json`. A new
  native build is needed for a standalone app; Expo Go already includes them.
