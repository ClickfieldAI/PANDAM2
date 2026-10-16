import { Ionicons } from '@expo/vector-icons';
import { type Category } from '@pandam/types';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Field,
  Notice,
  Row,
  Sheet,
  Stack,
  Text,
  useToast,
  useThemeColors,
} from '@pandam/ui';

import { ApiError } from '@/lib/api/client';
import { useCreateCategory } from '@/lib/hooks/useCategories';

const MAX = 32;

/** Same normalisation the Worker uses for the slug (the dedupe key). */
function slugOf(v: string) {
  return v
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * "Add a category" — a bottom sheet over the category grid. Validates as you
 * type, catches duplicates before the request (and again from the Worker's
 * 409), and on success writes the new category into the shared cache so it
 * appears in the grid immediately.
 */
export function AddCategorySheet({
  visible,
  onClose,
  existing,
  onCreated,
  onUseExisting,
}: {
  visible: boolean;
  onClose: () => void;
  /** Categories already on screen, for the instant duplicate check. */
  existing: Category[];
  onCreated?: (c: Category) => void;
  onUseExisting?: (id: string) => void;
}) {
  const colors = useThemeColors();

  const insets = useSafeAreaInsets();
  const toast = useToast();
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const clean = name.trim().replace(/\s+/g, ' ');
  const slug = slugOf(clean);
  const duplicate = useMemo(
    () => (slug ? existing.find((c) => c.slug === slug) : undefined),
    [existing, slug],
  );
  const tooShort = clean.length < 2;
  const noLetters = clean.length > 0 && !slug;
  const fieldError = !touched
    ? undefined
    : tooShort
      ? 'Enter at least 2 characters.'
      : noLetters
        ? 'Use letters or numbers.'
        : undefined;

  const serverError =
    create.error instanceof ApiError && create.error.status !== 409
      ? create.error.message
      : create.error && !(create.error instanceof ApiError)
        ? 'Could not save the category. Check your connection and try again.'
        : null;
  const serverDuplicateId =
    create.error instanceof ApiError && create.error.status === 409
      ? create.error.details?.existingId?.[0]
      : undefined;
  const dupId = duplicate?.id ?? serverDuplicateId;

  const close = () => {
    setName('');
    setTouched(false);
    create.reset();
    onClose();
  };

  const save = () => {
    setTouched(true);
    if (tooShort || noLetters || duplicate || create.isPending) return;
    create.mutate(
      { name: clean },
      {
        onSuccess: ({ category }) => {
          toast.success(`“${category.name}” added.`);
          onCreated?.(category);
          close();
        },
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Add a category"
      subtitle="Help others find what you trade. Categories are shared with everyone."
      bottomInset={insets.bottom}
    >
      <Stack gap="lg">
        <View>
          <Field
            label="Category name"
            placeholder="e.g. Pottery, Plants, Tailoring"
            value={name}
            onChangeText={(v) => {
              setName(v.slice(0, MAX));
              if (create.error) create.reset();
            }}
            onBlur={() => setTouched(true)}
            onSubmitEditing={save}
            returnKeyType="done"
            autoCapitalize="words"
            autoFocus
            maxLength={MAX}
            error={fieldError}
          />
          <Text
            variant="caption"
            tone="muted"
            style={{ alignSelf: 'flex-end', marginTop: 4 }}
            numeric
          >
            {clean.length}/{MAX}
          </Text>
        </View>

        {dupId ? (
          <Notice
            kind="neutral"
            icon={<Ionicons name="information-circle" size={16} color={colors.textMuted} />}
          >
            <Text variant="bodySm">
              {duplicate ? `“${duplicate.name}”` : 'That category'} already exists.
            </Text>
          </Notice>
        ) : null}

        {serverError ? (
          <Notice
            kind="danger"
            icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
          >
            {serverError}
          </Notice>
        ) : null}

        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="secondary" size="lg" fullWidth onPress={close} />
          </View>
          <View style={{ flex: 1 }}>
            {dupId && onUseExisting ? (
              <Button
                label="Use existing"
                size="lg"
                fullWidth
                onPress={() => {
                  onUseExisting(dupId);
                  close();
                }}
              />
            ) : (
              <Button
                label={create.isPending ? 'Saving…' : 'Add category'}
                size="lg"
                fullWidth
                loading={create.isPending}
                disabled={tooShort || noLetters || !!dupId}
                onPress={save}
              />
            )}
          </View>
        </Row>
      </Stack>
    </Sheet>
  );
}
