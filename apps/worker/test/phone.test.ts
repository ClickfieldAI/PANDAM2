/**
 * The shared phone helpers: one normal form (E.164) and the dialer / WhatsApp links built from it.
 * These run in the Worker (validation) and in the app (forms, Call / WhatsApp buttons) alike.
 */
import {
  buildPhone,
  createListingSchema,
  createMessageSchema,
  createNeedSchema,
  normalizePhone,
  phoneSchema,
  splitPhone,
  telUrl,
  whatsappAppUrl,
  whatsappUrl,
} from '@pandam/validation';
import { describe, expect, it } from 'vitest';

describe('normalizePhone', () => {
  it('strips spaces, dashes, dots and brackets, keeping the country code', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('+91-98765-43210')).toBe('+919876543210');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
    expect(normalizePhone('+44 20.7946.0958')).toBe('+442079460958');
    expect(normalizePhone('  +919876543210  ')).toBe('+919876543210');
  });

  it('accepts a 00 international prefix', () => {
    expect(normalizePhone('0091 98765 43210')).toBe('+919876543210');
  });

  it('refuses a number with no country code rather than guessing one', () => {
    expect(normalizePhone('9876543210')).toBeNull();
    expect(normalizePhone('09876543210')).toBeNull();
  });

  it('refuses letters, too-short and too-long numbers, and empty input', () => {
    expect(normalizePhone('+91 98765 abc10')).toBeNull();
    expect(normalizePhone('+1234')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('buildPhone / splitPhone (the country-code picker)', () => {
  it('joins a dial code and the number as typed', () => {
    expect(buildPhone('+91', '98765 43210')).toBe('+919876543210');
    expect(buildPhone('91', '98765-43210')).toBe('+919876543210');
    expect(buildPhone('+1', '(415) 555-2671')).toBe('+14155552671');
  });

  it('drops a national trunk 0', () => {
    expect(buildPhone('+44', '020 7946 0958')).toBe('+442079460958');
    expect(buildPhone('+91', '098765 43210')).toBe('+919876543210');
  });

  it('is null when what was typed is not a number', () => {
    expect(buildPhone('+91', '')).toBeNull();
    expect(buildPhone('+91', '12ab')).toBeNull();
    expect(buildPhone('+91', '123')).toBeNull();
  });

  it('splits a stored number back by the longest matching dial code', () => {
    const codes = ['+1', '+44', '+91', '+971', '+9'];
    expect(splitPhone('+919876543210', codes)).toEqual({ dialCode: '+91', national: '9876543210' });
    expect(splitPhone('+971501234567', codes)).toEqual({ dialCode: '+971', national: '501234567' });
    expect(splitPhone('+14155552671', codes)).toEqual({ dialCode: '+1', national: '4155552671' });
    expect(splitPhone(null, codes)).toBeNull();
  });
});

describe('call and WhatsApp links', () => {
  it('builds a tel: link with the number prefilled', () => {
    expect(telUrl('+919876543210')).toBe('tel:+919876543210');
    expect(telUrl('+91 98765 43210')).toBe('tel:+919876543210');
  });

  it('builds the official wa.me link: digits only, no plus, no spaces, no preset text', () => {
    expect(whatsappUrl('+919876543210')).toBe('https://wa.me/919876543210');
    expect(whatsappUrl('+1 (415) 555-2671')).toBe('https://wa.me/14155552671');
    expect(whatsappUrl('+919876543210')).not.toMatch(/[\s()+-]|text=/);
  });

  it('builds the app-scheme link WhatsApp registers, also without any message text', () => {
    expect(whatsappAppUrl('+919876543210')).toBe('whatsapp://send?phone=919876543210');
    expect(whatsappAppUrl('+919876543210')).not.toContain('text=');
  });

  it('builds nothing from an invalid number', () => {
    expect(telUrl('12345')).toBeNull();
    expect(whatsappUrl('not a number')).toBeNull();
    expect(whatsappAppUrl('')).toBeNull();
  });
});

describe('the schemas that carry a phone', () => {
  it('phoneSchema normalises and gives a useful message', () => {
    expect(phoneSchema.parse('+91 98765 43210')).toBe('+919876543210');
    const bad = phoneSchema.safeParse('98765');
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toMatch(/valid mobile number/i);
    const missing = phoneSchema.safeParse('');
    if (!missing.success) expect(missing.error.issues[0]?.message).toMatch(/enter your mobile/i);
  });

  const base = {
    categoryId: `cat_${'a'.repeat(32)}`,
    type: 'product',
    title: 'A bike',
    description: 'Rides fine, needs a bell.',
  };

  it('listings and requests accept an optional phone and normalise it', () => {
    expect(createListingSchema.parse({ ...base, phone: '+91 98765 43210' }).phone).toBe(
      '+919876543210',
    );
    expect(createNeedSchema.parse({ ...base, phone: '+91 98765 43210' }).phone).toBe(
      '+919876543210',
    );
    expect(createListingSchema.parse(base).phone).toBeUndefined();
    expect(createListingSchema.safeParse({ ...base, phone: '12' }).success).toBe(false);
    expect(createNeedSchema.safeParse({ ...base, phone: 'abc' }).success).toBe(false);
  });

  it('a message may be text, a photo, a video or a location, but never nothing', () => {
    expect(createMessageSchema.safeParse({}).success).toBe(false);
    expect(createMessageSchema.safeParse({ body: '  ' }).success).toBe(false);
    expect(createMessageSchema.safeParse({ body: 'hi' }).success).toBe(true);
    expect(createMessageSchema.safeParse({ imageKey: 'messages/u/a.jpg' }).success).toBe(true);
    expect(createMessageSchema.safeParse({ videoKey: 'messages/u/a.mp4' }).success).toBe(true);
    expect(
      createMessageSchema.safeParse({ location: { latitude: 12.97, longitude: 77.59 } }).success,
    ).toBe(true);
  });

  it('a location must be real coordinates and cannot ride along with media', () => {
    const at = (latitude: number, longitude: number) =>
      createMessageSchema.safeParse({ location: { latitude, longitude } }).success;
    expect(at(91, 0)).toBe(false);
    expect(at(-91, 0)).toBe(false);
    expect(at(0, 181)).toBe(false);
    expect(at(0, -181)).toBe(false);
    expect(at(90, 180)).toBe(true);
    expect(
      createMessageSchema.safeParse({
        location: { latitude: 1, longitude: 1 },
        imageKey: 'messages/u/a.jpg',
      }).success,
    ).toBe(false);
    expect(
      createMessageSchema.safeParse({
        location: { latitude: 1, longitude: 1 },
        videoKey: 'messages/u/a.mp4',
      }).success,
    ).toBe(false);
  });
});
