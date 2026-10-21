import { Ionicons } from '@expo/vector-icons';
import { buildPhone, splitPhone } from '@pandam/validation';
import { useMemo, useState } from 'react';
import { FlatList, Text as RNText, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, Press, Sheet, Text, spacing, useThemeColors } from '@pandam/ui';

import {
  COUNTRIES,
  type Country,
  DEFAULT_COUNTRY,
  DIAL_CODES,
  countryForDial,
  flagOf,
} from '@/lib/countries';

/** What the form keeps: the picked country and the number as typed (without the country code). */
export interface PhoneValue {
  country: Country;
  national: string;
}

export const EMPTY_PHONE: PhoneValue = { country: DEFAULT_COUNTRY, national: '' };

/** A stored E.164 number back into the form's shape (empty when there is none). */
export function phoneValueFrom(e164: string | null | undefined): PhoneValue {
  const parts = splitPhone(e164, DIAL_CODES);
  if (!parts || !parts.dialCode) return EMPTY_PHONE;
  return { country: countryForDial(parts.dialCode), national: parts.national };
}

/** The E.164 number the form currently holds, or null if it is empty or not a valid number. */
export function phoneValueToE164(v: PhoneValue): string | null {
  return buildPhone(v.country.dial, v.national);
}

/**
 * The mobile-number input: a country-code picker (flag + dial code) in front of the number.
 * Controlled; the form validates with `phoneValueToE164` and passes `error` back in. The same
 * rules run again on the server, so this is for a fast, friendly first answer only.
 */
export function PhoneField({
  value,
  onChange,
  error,
  hint,
  label = 'Mobile number',
  disabled,
}: {
  value: PhoneValue;
  onChange: (next: PhoneValue) => void;
  error?: string;
  hint?: string;
  label?: string;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q));
  }, [query]);

  return (
    <>
      <Field
        label={label}
        hint={hint}
        error={error}
        value={value.national}
        onChangeText={(national) => onChange({ ...value, national })}
        placeholder="98765 43210"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        editable={!disabled}
        maxLength={20}
        accessibilityLabel={`${label}, number without the country code`}
        leftIcon={
          <Press
            haptic="light"
            scale="none"
            dim
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Country code ${value.country.dial}, ${value.country.name}. Change.`}
            onPress={() => setOpen(true)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}
          >
            <RNText style={{ fontSize: 18 }}>{flagOf(value.country.iso)}</RNText>
            <Text variant="body" style={{ fontWeight: '600' }}>
              {value.country.dial}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </Press>
        }
      />

      <Sheet
        visible={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title="Country code"
        bottomInset={insets.bottom}
      >
        <View style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel="Search countries"
            style={{
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              paddingHorizontal: 14,
              color: colors.textPrimary,
              backgroundColor: colors.surfaceMuted,
              fontSize: 16,
            }}
          />
          <FlatList
            data={shown}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 320 }}
            ListEmptyComponent={
              <Text variant="caption" tone="muted" style={{ paddingVertical: spacing.md }}>
                No country matches “{query}”. You can type a full number starting with + instead.
              </Text>
            }
            renderItem={({ item }) => (
              <Press
                scale="none"
                accessibilityRole="button"
                accessibilityState={{ selected: item.iso === value.country.iso }}
                accessibilityLabel={`${item.name}, ${item.dial}`}
                onPress={() => {
                  onChange({ ...value, country: item });
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                }}
              >
                <RNText style={{ fontSize: 22 }}>{flagOf(item.iso)}</RNText>
                <Text variant="body" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                <Text variant="body" tone="muted">
                  {item.dial}
                </Text>
                {item.iso === value.country.iso ? (
                  <Ionicons name="checkmark" size={18} color={colors.accent} />
                ) : null}
              </Press>
            )}
          />
        </View>
      </Sheet>
    </>
  );
}
