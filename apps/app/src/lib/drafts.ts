/**
 * Local drafts for the "Something I have" / "Something I need" create flows.
 *
 * One draft per flow, under its own storage key, so clearing or submitting one
 * can never touch the other. Drafts live on the device only (AsyncStorage —
 * localStorage on web) and are deliberately NOT cleared by navigating away:
 * only a confirmed "Clear All" or a server-confirmed submit removes them.
 *
 * Photos are stored as their local URIs, never as binary data. A URI can stop
 * being valid (cache cleaned, web page reloaded), so `validPhotos` re-checks
 * each one on restore and silently drops any that no longer load.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DraftKind = 'listing' | 'need';

/** Bump when the shape changes; older drafts are then ignored, not mis-read. */
const VERSION = 1;
const KEY: Record<DraftKind, string> = {
  listing: 'pandam.draft.listing.v1',
  need: 'pandam.draft.need.v1',
};

export interface Draft {
  v: number;
  categoryId: string;
  type: 'product' | 'service' | 'skill';
  title: string;
  description: string;
  publish: boolean;
  transactionType: 'barter' | 'sale' | 'both';
  priceRupees: string;
  photos: string[];
  savedAt: number;
}

export type DraftValues = Omit<Draft, 'v' | 'savedAt'>;

const TYPES = ['product', 'service', 'skill'] as const;
const TX = ['barter', 'sale', 'both'] as const;
const str = (x: unknown) => (typeof x === 'string' ? x : '');

/** Accepts only a well-formed draft of the current version; anything else is dropped. */
function parse(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.v !== VERSION) return null;
    return {
      v: VERSION,
      categoryId: str(d.categoryId),
      type: TYPES.includes(d.type as never) ? (d.type as Draft['type']) : 'service',
      title: str(d.title),
      description: str(d.description),
      publish: typeof d.publish === 'boolean' ? d.publish : true,
      transactionType: TX.includes(d.transactionType as never)
        ? (d.transactionType as Draft['transactionType'])
        : 'barter',
      priceRupees: str(d.priceRupees),
      photos: Array.isArray(d.photos)
        ? d.photos.filter((p): p is string => typeof p === 'string')
        : [],
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function loadDraft(kind: DraftKind): Promise<Draft | null> {
  try {
    return parse(await AsyncStorage.getItem(KEY[kind]));
  } catch {
    return null; // unreadable storage behaves like "no draft"
  }
}

/**
 * Set by `markSubmitted` so a pending autosave (or the flush when the form
 * unmounts after a successful submit) cannot resurrect a draft that was just
 * deleted. Reset whenever a form mounts.
 */
const suppressed: Record<DraftKind, boolean> = { listing: false, need: false };

export function allowSaving(kind: DraftKind) {
  suppressed[kind] = false;
}

export async function saveDraft(kind: DraftKind, values: DraftValues): Promise<void> {
  if (suppressed[kind]) return;
  try {
    const draft: Draft = { v: VERSION, ...values, savedAt: Date.now() };
    await AsyncStorage.setItem(KEY[kind], JSON.stringify(draft));
  } catch (err) {
    // A failed write must never break typing; the in-memory form keeps working.
    console.warn('[drafts] could not save draft', err);
  }
}

export async function clearDraft(kind: DraftKind): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY[kind]);
  } catch (err) {
    console.warn('[drafts] could not clear draft', err);
  }
}

/** Call once the server has CONFIRMED the submission: removes this flow's draft only. */
export async function markSubmitted(kind: DraftKind): Promise<void> {
  suppressed[kind] = true;
  await clearDraft(kind);
}

/** True when nothing has been entered, so there is nothing worth saving. */
export function isEmptyDraft(v: DraftValues): boolean {
  return (
    !v.categoryId &&
    !v.title.trim() &&
    !v.description.trim() &&
    !v.priceRupees.trim() &&
    v.photos.length === 0
  );
}

/** Photos that can still be read. Missing or expired URIs are dropped, never shown broken. */
export async function validPhotos(uris: string[]): Promise<string[]> {
  const ok = await Promise.all(
    uris.map(async (uri) => {
      try {
        const res = await fetch(uri);
        return res.ok ? uri : null;
      } catch {
        return null;
      }
    }),
  );
  return ok.filter((u): u is string => u !== null);
}
