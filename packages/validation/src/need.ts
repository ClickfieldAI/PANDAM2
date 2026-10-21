import { boundedString, idSchema, itemTypeSchema, publishableStatusSchema, z } from './common';
import { phoneSchema } from './phone';

export const createNeedSchema = z.object({
  categoryId: idSchema('cat'),
  type: itemTypeSchema,
  title: boundedString(3, 120),
  description: boundedString(10, 4000),
  status: publishableStatusSchema.optional(),
  /** The poster's mobile number; see `createListingSchema.phone`. */
  phone: phoneSchema.optional(),
});
export type CreateNeedInput = z.infer<typeof createNeedSchema>;

export const updateNeedSchema = z
  .object({
    categoryId: idSchema('cat'),
    type: itemTypeSchema,
    title: boundedString(3, 120),
    description: boundedString(10, 4000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field is required' });
export type UpdateNeedInput = z.infer<typeof updateNeedSchema>;

export const setNeedStatusSchema = z.object({ status: publishableStatusSchema });
export type SetNeedStatusInput = z.infer<typeof setNeedStatusSchema>;
