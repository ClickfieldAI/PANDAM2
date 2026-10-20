import { platformSchema, z } from './common';

/**
 * Registering a device for push. The token is issued by Expo's push service
 * and has a fixed wrapper shape; validating it here stops an arbitrary string
 * ever reaching the send path.
 */
export const registerPushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10)
    .max(200)
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]\s]+\]$/, 'must be an Expo push token'),
  platform: platformSchema,
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const notificationPreferencesSchema = z
  .object({ pushEnabled: z.boolean().optional(), listingAlerts: z.boolean().optional() })
  .strict()
  .refine((v) => v.pushEnabled !== undefined || v.listingAlerts !== undefined, {
    message: 'Send at least one setting.',
  });
