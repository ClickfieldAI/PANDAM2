/**
 * Countries offered in the mobile-number picker: name, ISO code and international dial code.
 * India first (PANDAM's home market), the rest alphabetical. Not exhaustive on purpose — a
 * number from any other country can still be typed in full with its `+` and country code.
 */
export interface Country {
  iso: string;
  name: string;
  dial: string;
}

export const DEFAULT_COUNTRY: Country = { iso: 'IN', name: 'India', dial: '+91' };

const REST: Country[] = [
  { iso: 'AU', name: 'Australia', dial: '+61' },
  { iso: 'BD', name: 'Bangladesh', dial: '+880' },
  { iso: 'BR', name: 'Brazil', dial: '+55' },
  { iso: 'CA', name: 'Canada', dial: '+1' },
  { iso: 'CN', name: 'China', dial: '+86' },
  { iso: 'EG', name: 'Egypt', dial: '+20' },
  { iso: 'FR', name: 'France', dial: '+33' },
  { iso: 'DE', name: 'Germany', dial: '+49' },
  { iso: 'HK', name: 'Hong Kong', dial: '+852' },
  { iso: 'ID', name: 'Indonesia', dial: '+62' },
  { iso: 'IE', name: 'Ireland', dial: '+353' },
  { iso: 'IT', name: 'Italy', dial: '+39' },
  { iso: 'JP', name: 'Japan', dial: '+81' },
  { iso: 'KE', name: 'Kenya', dial: '+254' },
  { iso: 'KW', name: 'Kuwait', dial: '+965' },
  { iso: 'MY', name: 'Malaysia', dial: '+60' },
  { iso: 'MX', name: 'Mexico', dial: '+52' },
  { iso: 'NP', name: 'Nepal', dial: '+977' },
  { iso: 'NL', name: 'Netherlands', dial: '+31' },
  { iso: 'NZ', name: 'New Zealand', dial: '+64' },
  { iso: 'NG', name: 'Nigeria', dial: '+234' },
  { iso: 'OM', name: 'Oman', dial: '+968' },
  { iso: 'PK', name: 'Pakistan', dial: '+92' },
  { iso: 'PH', name: 'Philippines', dial: '+63' },
  { iso: 'QA', name: 'Qatar', dial: '+974' },
  { iso: 'RU', name: 'Russia', dial: '+7' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '+966' },
  { iso: 'SG', name: 'Singapore', dial: '+65' },
  { iso: 'ZA', name: 'South Africa', dial: '+27' },
  { iso: 'KR', name: 'South Korea', dial: '+82' },
  { iso: 'ES', name: 'Spain', dial: '+34' },
  { iso: 'LK', name: 'Sri Lanka', dial: '+94' },
  { iso: 'SE', name: 'Sweden', dial: '+46' },
  { iso: 'CH', name: 'Switzerland', dial: '+41' },
  { iso: 'TH', name: 'Thailand', dial: '+66' },
  { iso: 'TR', name: 'Turkey', dial: '+90' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '+971' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44' },
  { iso: 'US', name: 'United States', dial: '+1' },
  { iso: 'VN', name: 'Vietnam', dial: '+84' },
];

export const COUNTRIES: readonly Country[] = [DEFAULT_COUNTRY, ...REST];

/** Every dial code in the list, for splitting a stored number. */
export const DIAL_CODES: readonly string[] = [...new Set(COUNTRIES.map((c) => c.dial))];

/** Regional-indicator flag emoji from an ISO code ("IN" becomes the Indian flag). */
export function flagOf(iso: string): string {
  return [...iso.toUpperCase()]
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join('');
}

/** The listed country for a dial code (the first, so +1 is Canada/US and +91 is India). */
export function countryForDial(dial: string): Country {
  return COUNTRIES.find((c) => c.dial === dial) ?? DEFAULT_COUNTRY;
}
