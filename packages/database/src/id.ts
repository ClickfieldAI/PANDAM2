/**
 * Application-level identifier strategy for PANDAM.
 *
 * Every row's primary key is a prefixed, URL-safe string: `<prefix>_<uuid>`
 * where `<uuid>` is a hyphen-free RFC-4122 v4 UUID. The prefix makes ids
 * self-describing in logs, API responses and support tooling, and prevents an
 * id for one entity being accidentally used for another.
 *
 * `crypto.randomUUID()` is available in the Workers runtime and in Node >= 19,
 * so no dependency is needed.
 */

export const ID_PREFIXES = {
  user: 'usr',
  credential: 'crd',
  oauthIdentity: 'oid',
  session: 'ses',
  profile: 'prf',
  category: 'cat',
  listing: 'lst',
  listingImage: 'img',
  need: 'ned',
  needImage: 'nim',
  match: 'mch',
  offer: 'ofr',
  conversation: 'cnv',
  message: 'msg',
  barterTransaction: 'btx',
  review: 'rvw',
  notification: 'ntf',
  pushToken: 'pth',
  report: 'rpt',
  dispute: 'dsp',
  payment: 'pay',
  demoFeeTransaction: 'dft',
  itemView: 'vew',
} as const;

export type EntityName = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[EntityName];

/** Generate a new prefixed id for the given entity, e.g. `newId('user')`. */
export function newId(entity: EntityName): string {
  return `${ID_PREFIXES[entity]}_${crypto.randomUUID().replace(/-/g, '')}`;
}

/** True if `id` is a well-formed id for `entity`. */
export function isId(entity: EntityName, id: string): boolean {
  return new RegExp(`^${ID_PREFIXES[entity]}_[0-9a-f]{32}$`).test(id);
}
