/**
 * Report something. Reached with `?subjectType=…&subjectId=…&label=…`, so one
 * screen serves listings, needs, users, messages and transactions.
 *
 * It is honest about what happens next: a report is reviewed by a person and
 * does not hide anything on its own. Promising an instant takedown would be a
 * lie, and a report button that appears to do nothing is worse than none.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, View } from 'react-native';

import { type CreateReportInput, createReportSchema, z } from '@pandam/validation';
import {
  Button,
  Field,
  GroupedRows,
  ListRow,
  Notice,
  Screen,
  Stack,
  Text,
  colors,
  layout,
  radii,
  spacing,
  haptic,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ApiError } from '@/lib/api/client';
import { useCreateReport } from '@/lib/hooks/useReports';

type Reason = CreateReportInput['reason'];
type SubjectType = CreateReportInput['subjectType'];

const REASONS: { value: Reason; label: string; hint: string }[] = [
  { value: 'scam', label: 'Scam', hint: 'Asking for money off-app, fake items, bait and switch.' },
  { value: 'spam', label: 'Spam', hint: 'Adverts, repeated posts, nothing real being offered.' },
  { value: 'harassment', label: 'Harassment', hint: 'Threats, abuse, or unwanted contact.' },
  { value: 'inappropriate', label: 'Inappropriate', hint: 'Content that should not be on PANDAM.' },
  { value: 'other', label: 'Something else', hint: 'Tell us what is wrong in your own words.' },
];

const SUBJECT_NOUN: Record<SubjectType, string> = {
  user: 'person',
  listing: 'listing',
  need: 'request',
  message: 'message',
  transaction: 'trade',
};

const formSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'scam', 'inappropriate', 'other']),
  details: z.string().trim().max(2000),
});
type FormValues = z.infer<typeof formSchema>;

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    subjectType?: string;
    subjectId?: string;
    label?: string;
  }>();
  const create = useCreateReport();

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { reason: 'scam', details: '' },
  });
  const reason = watch('reason');
  const details = watch('details');

  // The params come from a route, so they are strings until proven otherwise;
  // parsing them against the shared schema is what makes them a valid subject.
  const subject = createReportSchema
    .pick({ subjectType: true, subjectId: true })
    .safeParse({ subjectType: params.subjectType, subjectId: params.subjectId });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/index'));

  if (!subject.success) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <AppHeader title="Report" back />
        <Text tone="secondary">There is nothing to report here.</Text>
      </Screen>
    );
  }

  const noun = SUBJECT_NOUN[subject.data.subjectType];
  const errorMessage =
    create.error instanceof ApiError
      ? create.error.message
      : create.error
        ? 'Could not send that report. Please try again.'
        : null;

  const submit = handleSubmit((values) => {
    create.mutate(
      {
        ...subject.data,
        reason: values.reason,
        details: values.details.trim() ? values.details.trim() : undefined,
      },
      {
        onSuccess: () => {
          haptic.success();
          Alert.alert(
            'Report sent',
            'Thank you. A person will review this. Nothing is hidden automatically, so you may still see it in the meantime.',
            [{ text: 'Done', onPress: goBack }],
          );
        },
      },
    );
  });

  return (
    <Screen
      padded={false}
      edges={['top', 'bottom']}
      footer={
        <Stack gap="sm">
          <Button
            label={create.isPending ? 'Sending…' : 'Send report'}
            variant="danger"
            size="lg"
            fullWidth
            loading={create.isPending}
            onPress={submit}
          />
          <Button label="Cancel" variant="quiet" fullWidth onPress={goBack} />
        </Stack>
      }
    >
      <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
        <AppHeader title={`Report this ${noun}`} subtitle={params.label || undefined} back />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: spacing['3xl'],
        }}
      >
        <Stack gap="xl">
          <Stack gap="md">
            <Text variant="h3">What is wrong?</Text>
            {/*
              A list with each reason explained, rather than a row of chips.
              Reporting someone is a considered choice and the labels alone are
              ambiguous — "inappropriate" means very different things to
              different people, so the hint has to be visible while choosing,
              not after.
            */}
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <GroupedRows>
                  {REASONS.map((r) => (
                    <ListRow
                      key={r.value}
                      title={r.label}
                      subtitle={r.hint}
                      accessibilityLabel={`${r.label}. ${r.hint}`}
                      onPress={() => field.onChange(r.value)}
                      trailing={
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: radii.pill,
                            borderWidth: field.value === r.value ? 0 : 1.5,
                            borderColor: colors.borderStrong,
                            backgroundColor:
                              field.value === r.value ? colors.danger : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {field.value === r.value ? (
                            <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                          ) : null}
                        </View>
                      }
                    />
                  ))}
                </GroupedRows>
              )}
            />
          </Stack>

          <Controller
            control={control}
            name="details"
            render={({ field, fieldState }) => (
              <Field
                label="Anything else?"
                optional={reason !== 'other'}
                hint={
                  reason === 'other'
                    ? 'Please describe what happened — this is all a reviewer will have to go on.'
                    : 'Detail makes a report much easier to act on.'
                }
                multiline
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                counter={{ value: details?.length ?? 0, max: 2000 }}
              />
            )}
          />

          {errorMessage ? (
            <Notice
              kind="danger"
              icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
            >
              {errorMessage}
            </Notice>
          ) : null}

          <Notice
            kind="neutral"
            icon={<Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />}
          >
            Reports are read by a person, not acted on automatically — nothing disappears the moment
            you send this. If you are in immediate danger, contact your local emergency services
            rather than us.
          </Notice>
        </Stack>
      </ScrollView>
    </Screen>
  );
}
