/**
 * Create / edit form for a listing ("I HAVE") or a need ("I NEED"). One
 * component, driven by `kind` + `mode`. Validation bounds come from the shared
 * `@pandam/validation` primitives so the client and server never disagree.
 *
 * Photos are handled by `<PhotoPicker>`: on create they are collected locally
 * and returned in `onSubmit` for the screen to upload once the item has an
 * id; on edit they upload and delete immediately against the existing item.
 * Both a listing's own photos and a need's reference photos work the same way.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Platform, ScrollView, Switch, Text as RNText, View } from 'react-native';

import { type MarketItem } from '@pandam/types';
import {
  Button,
  Card,
  Field,
  Notice,
  Press,
  Row,
  Stack,
  Text,
  colors,
  layout,
  spacing,
  haptic,
} from '@pandam/ui';
import { boundedString, itemTypeSchema, z } from '@pandam/validation';

import { AddCategorySheet } from '@/components/AddCategorySheet';
import { GuideRail } from '@/components/brand/GuideRail';
import { M } from '@/components/matches/MatchesUI';
import { PhotoPicker } from '@/components/PhotoPicker';
import { ApiError } from '@/lib/api/client';
import {
  allowSaving,
  clearDraft,
  isEmptyDraft,
  loadDraft,
  saveDraft,
  validPhotos,
  type DraftValues,
} from '@/lib/drafts';
import { TYPE_LABEL } from '@/lib/format';
import { useCategories } from '@/lib/hooks/useCategories';
import { categoryIcon, typeIcon } from '@/lib/icons';

/** Same cap as `priceAmountSchema` in @pandam/validation (paise). */
const MAX_PRICE_PAISE = 100_000_000;
const TRANSACTION_TYPES = ['barter', 'sale', 'both'] as const;
type TransactionTypeOption = (typeof TRANSACTION_TYPES)[number];

const formSchema = z
  .object({
    categoryId: z.string().min(1, 'Pick a category'),
    type: itemTypeSchema,
    title: boundedString(3, 120),
    description: boundedString(10, 4000),
    publish: z.boolean(),
    transactionType: z.enum(TRANSACTION_TYPES),
    /** Rupees, as typed — converted to paise on submit. Blank when `barter`. */
    priceRupees: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.transactionType === 'barter') return;
    const n = Number(v.priceRupees);
    if (!v.priceRupees.trim() || !Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', path: ['priceRupees'], message: 'Enter a price above ₹0' });
    } else if (Math.round(n * 100) > MAX_PRICE_PAISE) {
      // Mirrors the server's priceAmountSchema cap, so this fails here with a
      // readable message instead of as a generic "validation" error on submit.
      ctx.addIssue({
        code: 'custom',
        path: ['priceRupees'],
        message: 'The maximum price is ₹10,00,000',
      });
    }
  });
type FormValues = z.infer<typeof formSchema>;

export interface ItemFormSubmit {
  categoryId: string;
  type: FormValues['type'];
  title: string;
  description: string;
  status: 'draft' | 'published';
  /** Listings only — a need is never itself for sale. */
  transactionType?: TransactionTypeOption;
  /** Minor currency unit (paise for INR). Present iff `transactionType !== 'barter'`. */
  priceAmount?: number;
  priceCurrency?: string;
  /**
   * Local photo URIs picked during CREATE, which the caller uploads once the
   * item exists. Empty in edit mode, where the picker uploads directly.
   * Available for both a listing's own photos and a need's reference photos.
   */
  photos?: string[];
}

const TRANSACTION_TYPE_LABEL: Record<TransactionTypeOption, string> = {
  barter: 'Barter only',
  sale: 'Sale only',
  both: 'Either',
};
const TRANSACTION_TYPE_HINT: Record<TransactionTypeOption, string> = {
  barter: 'Trade it for something else. No money changes hands.',
  sale: 'Buyers pay a fixed price. Not eligible for barter matches.',
  both: 'People can trade for it or buy it outright — whichever suits them.',
};

export interface ItemFormProps {
  kind: 'listing' | 'need';
  mode: 'create' | 'edit';
  initial?: MarketItem;
  submitting?: boolean;
  error?: unknown;
  onSubmit: (values: ItemFormSubmit) => void;
}

/**
 * Outlined pill option. Selected = filled: red for categories and for a
 * listing's options, black for a need's options — as in the design.
 */
function PillChip({
  label,
  selected,
  fill = 'red',
  icon,
  onPress,
}: {
  label: string;
  selected: boolean;
  fill?: 'red' | 'black';
  icon?: (color: string) => ReactNode;
  onPress: () => void;
}) {
  const bg = selected ? (fill === 'red' ? M.red : '#111111') : 'transparent';
  const fg = selected ? '#FFFFFF' : M.ink;
  return (
    <Press
      haptic="selection"
      scale="sm"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        height: 42,
        paddingHorizontal: 16,
        borderRadius: 21,
        borderWidth: 1.3,
        borderColor: selected ? bg : '#2A2A2A',
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {icon ? icon(fg) : null}
      <RNText style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 15.5, color: fg }}>
        {label}
      </RNText>
    </Press>
  );
}

/**
 * A step in the form: an outlined red numbered circle, "Step n", the question
 * as a bold heading, and a short hint.
 */
function StepLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          borderWidth: 1.6,
          borderColor: M.red,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText style={{ fontFamily: 'InterTight_700Bold', fontSize: 17, color: M.red }}>
          {n}
        </RNText>
      </View>
      <View style={{ flex: 1 }}>
        <RNText style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 14, color: '#666' }}>
          Step {n}
        </RNText>
        <RNText
          style={{
            fontFamily: 'InterTight_800ExtraBold',
            fontSize: 21,
            color: M.ink,
            letterSpacing: -0.4,
          }}
        >
          {label}
        </RNText>
        {hint ? (
          <RNText
            style={{
              fontFamily: 'InterTight_400Regular',
              fontSize: 15,
              color: '#666',
              marginTop: 1,
            }}
          >
            {hint}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

export function ItemForm({ kind, mode, initial, submitting, error, onSubmit }: ItemFormProps) {
  const isHave = kind === 'listing';
  const categories = useCategories();
  const [photos, setPhotos] = useState<string[]>([]);

  const [addingCategory, setAddingCategory] = useState(false);
  const blank: FormValues = {
    categoryId: '',
    type: 'service',
    title: '',
    description: '',
    publish: true,
    transactionType: 'barter',
    priceRupees: '',
  };
  const { control, handleSubmit, formState, watch, setValue, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      categoryId: initial?.category.id ?? '',
      type: initial?.type ?? 'service',
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      publish: initial ? initial.status === 'published' : true,
      transactionType: initial?.pricing?.transactionType ?? 'barter',
      priceRupees:
        initial?.pricing?.priceAmount != null ? String(initial.pricing.priceAmount / 100) : '',
    },
  });

  /* ------------------------------------------------------------- drafts -- */
  // Only the CREATE flow keeps a draft (edit always starts from the saved item).
  // The form is not shown until the saved draft has been loaded, so an async
  // restore can never overwrite something the user has just typed.
  const keepsDraft = mode === 'create';
  const [hydrated, setHydrated] = useState(!keepsDraft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DraftValues | null>(null);

  useEffect(() => {
    if (!keepsDraft) return undefined;
    allowSaving(kind);
    let alive = true;
    void (async () => {
      const d = await loadDraft(kind);
      if (d && alive) {
        reset({
          categoryId: d.categoryId,
          type: d.type,
          title: d.title,
          description: d.description,
          publish: d.publish,
          transactionType: isHave ? d.transactionType : 'barter',
          priceRupees: d.priceRupees,
        });
        const usable = await validPhotos(d.photos);
        if (alive) setPhotos(usable);
      }
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
    // Load once per mount; `reset`/`kind` are stable for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pending.current;
    pending.current = null;
    if (!v) return;
    void (isEmptyDraft(v) ? clearDraft(kind) : saveDraft(kind, v));
  };

  const all = watch();
  const snapshot = JSON.stringify([all, photos]);
  useEffect(() => {
    if (!keepsDraft || !hydrated) return;
    pending.current = {
      categoryId: all.categoryId ?? '',
      type: all.type ?? 'service',
      title: all.title ?? '',
      description: all.description ?? '',
      publish: all.publish ?? true,
      transactionType: all.transactionType ?? 'barter',
      priceRupees: all.priceRupees ?? '',
      photos,
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
    // `snapshot` captures every field + photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, hydrated, keepsDraft]);

  // Leaving the screen (back, another tab) must NOT lose the last keystrokes:
  // write anything still waiting for the debounce. It never deletes the draft.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const doClear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    reset(blank);
    setPhotos([]);
    void clearDraft(kind);
  };
  // Destructive, so it asks first. Alert is a no-op on web, hence the confirm there.
  const confirmClear = () => {
    const title = 'Clear all?';
    const body = isHave
      ? 'This removes everything you have entered for this listing and starts again.'
      : 'This removes everything you have entered for this request and starts again.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${body}`)) doClear();
      return;
    }
    haptic.warning();
    Alert.alert(title, body, [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: doClear },
    ]);
  };

  const title = watch('title');
  const description = watch('description');
  const transactionType = watch('transactionType');
  const categoryId = watch('categoryId');
  // Guided path progress (visual only): how far down the form the user is.
  const detailsDone = (title?.trim().length ?? 0) >= 3 && (description?.trim().length ?? 0) >= 10;
  const guideDone = !categoryId ? 0 : photos.length === 0 ? 1 : !detailsDone ? 2 : 3;

  const submit = handleSubmit((v) => {
    const isBarter = v.transactionType === 'barter';
    onSubmit({
      categoryId: v.categoryId,
      type: v.type,
      title: v.title.trim(),
      description: v.description.trim(),
      status: v.publish ? 'published' : 'draft',
      photos,
      ...(isHave
        ? {
            transactionType: v.transactionType,
            ...(isBarter
              ? {}
              : { priceAmount: Math.round(Number(v.priceRupees) * 100), priceCurrency: 'INR' }),
          }
        : {}),
    });
  });

  const formError =
    error instanceof ApiError ? error.message : error ? 'Could not save. Try again.' : null;

  const optionFill = isHave ? ('red' as const) : ('black' as const);

  if (!hydrated) return <View style={{ flex: 1 }} />;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: layout.gutter,
        paddingTop: spacing.md,
        paddingBottom: spacing['6xl'],
      }}
    >
      <Stack gap="2xl">
        {mode === 'create' ? (
          <GuideRail
            steps={
              isHave
                ? ['Item', 'Photos', 'Details', 'Want', 'Preview']
                : ['Need', 'Kind', 'Details', 'Photos', 'Preview']
            }
            done={guideDone}
          />
        ) : null}
        {/* ------------------------------------------------------- category -- */}
        <View>
          <StepLabel n={1} label="Pick a category" hint="This is what matching keys off." />
          <Controller
            control={control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <View style={{ gap: spacing.sm }}>
                <Row gap="sm" style={{ flexWrap: 'wrap' }}>
                  {(categories.data ?? []).map((c) => (
                    <PillChip
                      key={c.id}
                      label={c.name}
                      selected={field.value === c.id}
                      icon={(color) => (
                        <Ionicons name={categoryIcon(c.slug)} size={16} color={color} />
                      )}
                      onPress={() => field.onChange(c.id)}
                    />
                  ))}
                  {/* Nothing fits? Members can add a category right here. */}
                  <PillChip
                    label="New category"
                    selected={false}
                    icon={() => <Ionicons name="add" size={18} color={M.red} />}
                    onPress={() => setAddingCategory(true)}
                  />
                </Row>
                {fieldState.error ? (
                  <Text variant="caption" tone="danger">
                    {fieldState.error.message}
                  </Text>
                ) : null}
              </View>
            )}
          />
        </View>

        <AddCategorySheet
          visible={addingCategory}
          onClose={() => setAddingCategory(false)}
          existing={categories.data ?? []}
          onCreated={(c) => setValue('categoryId', c.id, { shouldValidate: true })}
          onUseExisting={(id) => setValue('categoryId', id, { shouldValidate: true })}
        />

        {/* ----------------------------------------------------------- type -- */}
        <View>
          <StepLabel n={2} label="What kind of thing is it?" />
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Row gap="sm">
                {(['product', 'service', 'skill'] as const).map((t) => (
                  <PillChip
                    key={t}
                    label={TYPE_LABEL[t]}
                    fill={optionFill}
                    selected={field.value === t}
                    icon={(color) => <Ionicons name={typeIcon(t)} size={16} color={color} />}
                    onPress={() => field.onChange(t)}
                  />
                ))}
              </Row>
            )}
          />
        </View>

        {/* -------------------------------------------------------- pricing -- */}
        {isHave ? (
          <View>
            <StepLabel n={3} label="How can people get this?" />
            <Stack gap="md">
              <Row gap="sm">
                {TRANSACTION_TYPES.map((t) => (
                  <Controller
                    key={t}
                    control={control}
                    name="transactionType"
                    render={({ field }) => (
                      <PillChip
                        label={TRANSACTION_TYPE_LABEL[t]}
                        fill={optionFill}
                        selected={field.value === t}
                        onPress={() => field.onChange(t)}
                      />
                    )}
                  />
                ))}
              </Row>
              <Notice
                kind={transactionType === 'barter' ? 'neutral' : 'info'}
                icon={
                  <Ionicons
                    name={transactionType === 'barter' ? 'swap-horizontal' : 'card-outline'}
                    size={15}
                    color={transactionType === 'barter' ? colors.textMuted : colors.info}
                  />
                }
              >
                {TRANSACTION_TYPE_HINT[transactionType]}
              </Notice>
              {transactionType !== 'barter' ? (
                <Controller
                  control={control}
                  name="priceRupees"
                  render={({ field, fieldState }) => (
                    <Field
                      label="Price"
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      leftIcon={
                        <Text variant="bodyStrong" tone="secondary">
                          ₹
                        </Text>
                      }
                      value={field.value}
                      onChangeText={(t) => field.onChange(t.replace(/[^0-9.]/g, ''))}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              ) : null}
            </Stack>
          </View>
        ) : null}

        {/* --------------------------------------------------------- details -- */}
        <View>
          <StepLabel
            n={isHave ? 4 : 3}
            label="Describe it"
            hint="Clear beats clever — people search this."
          />
          <Stack gap="lg">
            <Controller
              control={control}
              name="title"
              render={({ field, fieldState }) => (
                <Field
                  label={isHave ? 'What do you have?' : 'What do you need?'}
                  placeholder={isHave ? 'e.g. Hand-built websites' : 'e.g. Product photography'}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  counter={{ value: title?.length ?? 0, max: 120 }}
                  maxLength={120}
                />
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <Field
                  label="Details"
                  hint="What’s included, condition, timescale — anything a trader should know."
                  placeholder="Add a few details…"
                  multiline
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  counter={{ value: description?.length ?? 0, max: 4000 }}
                />
              )}
            />
          </Stack>
        </View>

        {/* ---------------------------------------------------------- photos -- */}
        <View>
          <StepLabel
            n={isHave ? 5 : 4}
            label="Photos"
            hint={
              mode === 'edit'
                ? 'Saved as you add them.'
                : isHave
                  ? 'Optional, but they get traded faster.'
                  : 'Optional — a reference photo helps people recognise what you want.'
            }
          />
          <PhotoPicker
            kind={kind}
            existing={initial?.images ?? []}
            local={photos}
            onChangeLocal={setPhotos}
            itemId={mode === 'edit' ? initial?.id : undefined}
          />
        </View>

        {/* --------------------------------------------------------- publish -- */}
        <Card padded>
          <Controller
            control={control}
            name="publish"
            render={({ field }) => (
              <Row justify="space-between" gap="md">
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Make it visible now</Text>
                  <Text variant="caption" tone="muted">
                    {field.value
                      ? 'It will appear in Discover and count towards barter matches.'
                      : 'Saved as a draft — only you can see it until you publish.'}
                  </Text>
                </View>
                <Switch
                  value={field.value}
                  onValueChange={(next) => {
                    haptic.selection();
                    field.onChange(next);
                  }}
                  trackColor={{ true: isHave ? colors.accent : colors.need }}
                  accessibilityLabel="Publish now"
                />
              </Row>
            )}
          />
        </Card>

        {formError ? (
          <Notice
            kind="danger"
            icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
          >
            {formError}
          </Notice>
        ) : null}

        <Button
          label={
            submitting
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : isHave
                  ? 'List this item'
                  : 'Post this request'
          }
          variant={isHave ? 'primary' : 'need'}
          size="lg"
          fullWidth
          loading={submitting}
          disabled={formState.isSubmitting}
          onPress={submit}
        />

        {mode === 'create' ? (
          <Press
            haptic="light"
            scale="md"
            accessibilityRole="button"
            accessibilityLabel="Clear All"
            onPress={confirmClear}
            hitSlop={10}
            style={{ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 }}
          >
            <RNText style={{ fontFamily: 'InterTight_700Bold', fontSize: 16, color: M.red }}>
              Clear All
            </RNText>
          </Press>
        ) : null}
      </Stack>
    </ScrollView>
  );
}
