/**
 * The pure parts of the chat media / contact features: attachment limits, map links, and the
 * country-code list behind the mobile-number field. (The phone / WhatsApp link builders live in
 * `@pandam/validation` and are tested with the Worker's phone tests.)
 */
import { buildPhone, normalizePhone, splitPhone, telUrl, whatsappUrl } from '@pandam/validation';
import { describe, expect, it } from 'vitest';

import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  checkPickedMedia,
  mediaFileName,
  mediaType,
} from '../src/lib/chat/attachments';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DIAL_CODES,
  countryForDial,
  flagOf,
} from '../src/lib/countries';
import { formatCoordinates, googleMapsUrl, mapLinks } from '../src/lib/maps';

const MB = 1024 * 1024;

describe('attachment checks (before any upload starts)', () => {
  it('accepts ordinary photos and videos', () => {
    expect(checkPickedMedia({ kind: 'image', uri: 'file:///a.jpg', fileSize: 2 * MB })).toBeNull();
    expect(
      checkPickedMedia({
        kind: 'video',
        uri: 'file:///a.mov',
        mimeType: 'video/quicktime',
        fileSize: 30 * MB,
      }),
    ).toBeNull();
    expect(checkPickedMedia({ kind: 'video', uri: 'file:///a.mp4' })).toBeNull(); // size unknown: server decides
  });

  it('refuses a photo over 8 MB and a video over 40 MB, saying how big it was', () => {
    const photo = checkPickedMedia({
      kind: 'image',
      uri: 'file:///a.jpg',
      fileSize: MAX_IMAGE_BYTES + MB,
    });
    expect(photo).toMatch(/8 MB or smaller/);
    expect(photo).toMatch(/9\.0 MB/);
    const video = checkPickedMedia({
      kind: 'video',
      uri: 'file:///a.mp4',
      fileSize: MAX_VIDEO_BYTES + 1,
    });
    expect(video).toMatch(/40 MB or smaller/);
    // Exactly at the limit is fine.
    expect(
      checkPickedMedia({ kind: 'video', uri: 'file:///a.mp4', fileSize: MAX_VIDEO_BYTES }),
    ).toBeNull();
  });

  it('refuses types the server would refuse', () => {
    expect(
      checkPickedMedia({ kind: 'image', uri: 'file:///a.gif', mimeType: 'image/gif' }),
    ).toMatch(/JPEG/);
    expect(
      checkPickedMedia({ kind: 'video', uri: 'file:///a.avi', mimeType: 'video/x-msvideo' }),
    ).toMatch(/MP4/);
    expect(checkPickedMedia({ kind: 'video', uri: 'file:///a.mkv' })).toMatch(/MP4/);
  });

  it('names and types an upload from what the picker gave, with safe fallbacks', () => {
    expect(mediaType({ kind: 'image', uri: 'file:///x/IMG_1.HEIC' })).toBe('image/heic');
    expect(mediaType({ kind: 'video', uri: 'file:///x/clip.MOV' })).toBe('video/quicktime');
    expect(mediaType({ kind: 'video', uri: 'file:///x/clip', mimeType: 'video/mp4' })).toBe(
      'video/mp4',
    );
    expect(mediaType({ kind: 'image', uri: 'content://media/42' })).toBe('image/jpeg');
    expect(mediaFileName({ kind: 'image', uri: 'file:///x/IMG_1.PNG' })).toBe('image.png');
    expect(mediaFileName({ kind: 'video', uri: 'content://media/42' })).toBe('video.mp4');
  });
});

describe('opening a shared location in a maps app', () => {
  const place = { latitude: 12.9716, longitude: 77.5946, placeName: 'Cubbon Park, Bengaluru' };

  it('Android: a geo: link first (the system chooser or the preferred app), then the web link', () => {
    const [first, second] = mapLinks(place, 'android');
    expect(first).toBe('geo:12.9716,77.5946?q=12.9716,77.5946(Cubbon%20Park%2C%20Bengaluru)');
    expect(second).toBe(googleMapsUrl(place));
  });

  it('iOS: Apple Maps first, Google Maps as the fallback', () => {
    const [first, second] = mapLinks(place, 'ios');
    expect(first).toBe('https://maps.apple.com/?ll=12.9716,77.5946&q=Cubbon%20Park%2C%20Bengaluru');
    expect(second).toBe(googleMapsUrl(place));
  });

  it('web and unknown platforms: the Google Maps link, which always works in a browser', () => {
    expect(mapLinks(place, 'web')).toEqual([googleMapsUrl(place)]);
    expect(googleMapsUrl(place)).toBe(
      'https://www.google.com/maps/search/?api=1&query=12.9716%2C77.5946',
    );
  });

  it('works without a place name, and with negative coordinates', () => {
    const p = { latitude: -33.8688, longitude: 151.2093 };
    expect(mapLinks(p, 'android')[0]).toBe('geo:-33.8688,151.2093?q=-33.8688,151.2093');
    expect(mapLinks(p, 'ios')[0]).toBe('https://maps.apple.com/?ll=-33.8688,151.2093');
    expect(formatCoordinates(p)).toBe('-33.86880, 151.20930');
  });
});

describe('the country-code picker', () => {
  it('starts with India and has unique ISO codes', () => {
    expect(COUNTRIES[0]).toEqual(DEFAULT_COUNTRY);
    expect(DEFAULT_COUNTRY.dial).toBe('+91');
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
  });

  it('every dial code is a valid "+digits" prefix', () => {
    for (const c of COUNTRIES) expect(c.dial).toMatch(/^\+[1-9]\d{0,3}$/);
  });

  it('draws flags and finds a country from its dial code', () => {
    expect(flagOf('IN')).toBe('\u{1F1EE}\u{1F1F3}');
    expect(countryForDial('+91').iso).toBe('IN');
    expect(countryForDial('+44').iso).toBe('GB');
    expect(countryForDial('+999').iso).toBe('IN'); // unknown: falls back to the default
  });

  it('round-trips a number through the picker and the form', () => {
    // typed: India + "98765 43210"  ->  stored E.164  ->  back into the picker
    const e164 = buildPhone('+91', '98765 43210');
    expect(e164).toBe('+919876543210');
    const parts = splitPhone(e164, DIAL_CODES)!;
    expect(parts).toEqual({ dialCode: '+91', national: '9876543210' });
    expect(countryForDial(parts.dialCode).name).toBe('India');
  });

  it('every listed country can produce a valid number', () => {
    for (const c of COUNTRIES) {
      expect(buildPhone(c.dial, '5551234567'), c.name).not.toBeNull();
    }
  });
});

describe('the dialer and WhatsApp links the buttons open', () => {
  it('Call opens the dialer with the stored number; WhatsApp uses wa.me with digits only', () => {
    const stored = normalizePhone('+91 98765-43210')!;
    expect(telUrl(stored)).toBe('tel:+919876543210');
    expect(whatsappUrl(stored)).toBe('https://wa.me/919876543210');
  });
});
