import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
let failing = false;
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => {
      if (failing) throw new Error('storage down');
      return store.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (failing) throw new Error('storage down');
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      if (failing) throw new Error('storage down');
      store.delete(k);
    },
  },
}));

import {
  allowSaving,
  clearDraft,
  isEmptyDraft,
  loadDraft,
  markSubmitted,
  saveDraft,
  type DraftValues,
} from '../src/lib/drafts';
import { loadTourStatus, saveTourStatus } from '../src/lib/tour/storage';

const values: DraftValues = {
  categoryId: 'cat_1',
  type: 'service',
  title: 'Logo design',
  description: 'I will draw a logo',
  publish: true,
  transactionType: 'barter',
  priceRupees: '',
  photos: [],
};

beforeEach(() => {
  store.clear();
  failing = false;
  allowSaving('listing');
  allowSaving('need');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('drafts', () => {
  it('round-trips a draft and keeps listing and need drafts apart', async () => {
    await saveDraft('listing', values);
    expect((await loadDraft('listing'))?.title).toBe('Logo design');
    expect(await loadDraft('need')).toBeNull();
  });

  it('is removed only once the server confirmed, and a late autosave cannot bring it back', async () => {
    await saveDraft('listing', values);
    await markSubmitted('listing');
    expect(await loadDraft('listing')).toBeNull();
    await saveDraft('listing', values); // the flush on unmount
    expect(await loadDraft('listing')).toBeNull();
    allowSaving('listing'); // a new form mounts
    await saveDraft('listing', values);
    expect(await loadDraft('listing')).not.toBeNull();
  });

  it('drops corrupt, wrong-version and junk data instead of crashing', async () => {
    await saveDraft('listing', values);
    const key = [...store.keys()][0]!;
    for (const raw of ['not json', '{"v":999}', 'null', '[]']) {
      store.set(key, raw);
      expect(await loadDraft('listing'), raw).toBeNull();
    }
  });

  it('sanitises unexpected field types in an otherwise valid draft', async () => {
    await saveDraft('listing', values);
    const key = [...store.keys()][0]!;
    const d = JSON.parse(store.get(key)!);
    store.set(key, JSON.stringify({ ...d, type: 'weapon', title: 42, photos: ['a', 7, null] }));
    expect(await loadDraft('listing')).toMatchObject({ type: 'service', title: '', photos: ['a'] });
  });

  it('treats unavailable storage as "no draft" and never throws while typing', async () => {
    failing = true;
    await expect(saveDraft('listing', values)).resolves.toBeUndefined();
    await expect(clearDraft('listing')).resolves.toBeUndefined();
    expect(await loadDraft('listing')).toBeNull();
  });

  it('knows when there is nothing worth saving', () => {
    expect(isEmptyDraft({ ...values, categoryId: '', title: ' ', description: '' })).toBe(true);
    expect(isEmptyDraft(values)).toBe(false);
  });
});

describe('tour state', () => {
  it('is kept per account', async () => {
    await saveTourStatus('usr_a', 'completed');
    expect(await loadTourStatus('usr_a')).toBe('completed');
    expect(await loadTourStatus('usr_b')).toBeNull();
  });
  it('ignores garbage and survives storage failure', async () => {
    store.set('pandam.tour.v1.usr_a', 'something else');
    expect(await loadTourStatus('usr_a')).toBeNull();
    failing = true;
    await expect(saveTourStatus('usr_a', 'skipped')).resolves.toBeUndefined();
    expect(await loadTourStatus('usr_a')).toBeNull();
  });
});
