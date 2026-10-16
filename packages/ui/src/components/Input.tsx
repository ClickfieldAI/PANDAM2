import { type ReactNode, forwardRef, useCallback, useState } from 'react';
import { Platform, Pressable, TextInput, type TextInputProps, View } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing, timings, typography } from '../tokens';

import { Text } from './Text';

export interface InputProps extends TextInputProps {
  invalid?: boolean;
  /** Node rendered inside the field, before the text. */
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/** Bare themed text input. Use `Field` for label, hint and error. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { invalid, leftIcon, rightIcon, style, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const colors = useThemeColors();

  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (e) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );
  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (e) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  /*
   * Resting state is the muted surface with a hairline; focus lifts it to
   * white and thickens the ring to 2px in the brand colour. A filled resting
   * field tells you where to type before you have touched anything, which a
   * bare underline or an outline-only field does not — and because the border
   * is drawn INSIDE via a matched inset, the field does not grow by a pixel
   * when it gains focus.
   */
  const ring = invalid ? colors.danger : focused ? colors.accent : colors.border;
  const ringWidth = focused || invalid ? 2 : 1;
  const inset = focused || invalid ? 0 : 1;

  return (
    <View
      onPointerEnter={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onPointerLeave={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      style={[
        {
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: spacing.sm,
          borderWidth: ringWidth,
          borderColor: hovered && !focused && !invalid ? colors.borderStrong : ring,
          backgroundColor: focused ? colors.surface : colors.surfaceMuted,
          borderRadius: radii.md,
          paddingHorizontal: spacing.lg - inset,
          paddingVertical: inset,
          minHeight: 48,
        },
        Platform.OS === 'web'
          ? ({
              transitionDuration: `${timings.fast}ms`,
              transitionProperty: 'border-color, background-color',
            } as never)
          : null,
      ]}
    >
      {leftIcon}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        onFocus={handleFocus}
        onBlur={handleBlur}
        multiline={multiline}
        style={[
          {
            flex: 1,
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: multiline ? typography.body.lineHeight : undefined,
            paddingVertical: multiline ? spacing.md : 0,
            minHeight: multiline ? 104 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          // The browser's own focus ring would sit on the inner input and
          // fight the field's ring; the wrapper communicates focus already.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as never) : null,
          style,
        ]}
        {...rest}
      />
      {rightIcon}
    </View>
  );
});

export interface FieldProps extends InputProps {
  label: string;
  hint?: string;
  error?: string;
  /** Live character counter, e.g. 120-character titles. */
  counter?: { value: number; max: number };
  /**
   * Marks the field as optional in the label. PANDAM marks what is OPTIONAL
   * rather than starring what is required: most fields in this product are
   * required, so the asterisks would outnumber the exceptions and stop
   * carrying information.
   */
  optional?: boolean;
  /** A trailing action rendered beside the label, e.g. "Forgot password?". */
  labelAction?: ReactNode;
}

/** Label + input + hint/error. The building block of every form. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, counter, optional, labelAction, ...input },
  ref,
) {
  const overCount = counter && counter.value > counter.max;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          <Text variant="label">{label}</Text>
          {optional ? (
            <Text variant="caption" tone="faint">
              Optional
            </Text>
          ) : null}
        </View>
        {labelAction ??
          (counter ? (
            <Text variant="caption" numeric tone={overCount ? 'danger' : 'muted'}>
              {counter.value}/{counter.max}
            </Text>
          ) : null)}
      </View>

      <Input ref={ref} invalid={!!error} accessibilityLabel={label} {...input} />

      {/*
        An error is never signalled by colour alone — a red line of text is
        invisible to a red-green colourblind reader scanning a form. The glyph
        is what makes it unambiguous, and it is why this block is not simply a
        tone swap on the hint.
      */}
      {error ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <Text variant="caption" tone="danger" style={{ marginTop: 0.5 }}>
            ⚠
          </Text>
          <Text variant="caption" tone="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

export interface PasswordFieldProps extends Omit<FieldProps, 'rightIcon' | 'secureTextEntry'> {
  /** Node for the "show" affordance; receives no props, so pass an icon pair. */
  revealIcon?: ReactNode;
  hideIcon?: ReactNode;
}

/**
 * A password field with a reveal toggle.
 *
 * Typing a 12-character password blind on a phone keyboard is the most common
 * reason a correct password gets rejected, so the toggle is a real usability
 * feature rather than a flourish. It defaults to hidden and is a button, so
 * it is reachable by keyboard and announced by a screen reader.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { revealIcon, hideIcon, ...props },
  ref,
) {
  const [shown, setShown] = useState(false);

  return (
    <Field
      ref={ref}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      rightIcon={
        revealIcon || hideIcon ? (
          <Pressable
            onPress={() => setShown((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          >
            {shown ? hideIcon : revealIcon}
          </Pressable>
        ) : undefined
      }
      {...props}
    />
  );
});

export interface SearchInputProps extends TextInputProps {
  icon?: ReactNode;
  /** Shown as a tappable clear affordance once there is a value. */
  onClear?: () => void;
  clearIcon?: ReactNode;
}

/** Rounded search box. Pass an `icon` node (e.g. from @expo/vector-icons). */
export const SearchInput = forwardRef<TextInput, SearchInputProps>(function SearchInput(
  { icon, onClear, clearIcon, style, value, onFocus, onBlur, ...rest },
  ref,
) {
  const colors = useThemeColors();

  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.accent : colors.border,
          backgroundColor: colors.surface,
          borderRadius: radii.pill,
          paddingHorizontal: focused ? spacing.lg - 1 : spacing.lg,
          height: 46,
        },
        Platform.OS === 'web'
          ? ({
              transitionDuration: `${timings.fast}ms`,
              transitionProperty: 'border-color',
            } as never)
          : null,
      ]}
    >
      {icon}
      <TextInput
        ref={ref}
        value={value}
        placeholderTextColor={colors.textFaint}
        returnKeyType="search"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          { flex: 1, color: colors.textPrimary, fontSize: typography.body.fontSize },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as never) : null,
          style,
        ]}
        {...rest}
      />
      {onClear && value ? (
        <Pressable
          onPress={onClear}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          {clearIcon}
        </Pressable>
      ) : null}
    </View>
  );
});
