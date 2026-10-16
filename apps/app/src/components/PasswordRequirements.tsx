import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Text, spacing, useThemeColors } from '@pandam/ui';

/**
 * Live checklist under the password field on sign-up.
 *
 * The rule is "10+ characters, with a letter and a number". Told only as an
 * error after submitting, that is a small puzzle; shown as a checklist that
 * ticks as you type, it is not a rule at all — you can see when you are done.
 * This is the cheapest possible version of "the error should explain how to
 * fix it": pre-empt the error entirely.
 *
 * It renders nothing until the field has been touched, so an untouched form
 * does not open with a list of things you have failed to do.
 */
const RULES = [
  { label: 'At least 10 characters', test: (v: string) => v.length >= 10 },
  { label: 'A letter', test: (v: string) => /[A-Za-z]/.test(v) },
  { label: 'A number', test: (v: string) => /\d/.test(v) },
];

export function PasswordRequirements({ value }: { value: string }) {
  const colors = useThemeColors();

  if (!value) return null;

  return (
    <View style={{ gap: spacing.xs, marginTop: -spacing.xs }}>
      {RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <View
            key={rule.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            {/*
              The icon changes shape as well as colour — a colourblind reader
              gets the same information from the tick versus the empty circle.
            */}
            <Ionicons
              name={met ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={met ? colors.accent : colors.textFaint}
            />
            <Text variant="caption" tone={met ? 'success' : 'muted'}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
