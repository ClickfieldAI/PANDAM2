/**
 * DEMO DATA — frontend-only, never shipped as real data.
 *
 * Believable Pandam members, listings (I HAVE), needs (I NEED) and the
 * reciprocal matches / offers / conversations that fall out of them. Shapes are
 * the real `@pandam/types` view models, so screens render them through exactly
 * the same components as API data.
 *
 * Photos are remote Unsplash URLs (royalty-free placeholders). If one fails to
 * load, `CoverTile` degrades to its warm gradient — nothing breaks.
 *
 * Nothing outside `src/dummy/` should import this file directly; go through
 * `./index.ts`, which gates everything on `IS_DEMO_DATA`.
 */
import {
  type CategoryRef,
  type ConversationView,
  type ItemType,
  type MarketItem,
  type MessageView,
  type OfferView,
  type OwnerRef,
  type ReciprocalMatchView,
} from '@pandam/types';

const NOW = Date.now();
const H = 60 * 60 * 1000;
const D = 24 * H;

/* ------------------------------------------------------------ categories -- */

/** Same slugs as the real seed (`packages/database/src/seed.ts`). */
export const demoCategories = {
  technology: { id: 'demo-cat-tech', name: 'Technology', slug: 'technology' },
  electronics: { id: 'demo-cat-elec', name: 'Electronics', slug: 'electronics' },
  photography: { id: 'demo-cat-photo', name: 'Photography', slug: 'photography' },
  music: { id: 'demo-cat-music', name: 'Musical Instruments', slug: 'music' },
  gaming: { id: 'demo-cat-gaming', name: 'Gaming', slug: 'gaming' },
  services: { id: 'demo-cat-services', name: 'Services', slug: 'services' },
  skills: { id: 'demo-cat-skills', name: 'Skills', slug: 'skills-and-tutoring' },
  books: { id: 'demo-cat-books', name: 'Books', slug: 'books' },
  furniture: { id: 'demo-cat-furn', name: 'Furniture', slug: 'furniture' },
  home: { id: 'demo-cat-home', name: 'Home & Living', slug: 'home-and-garden' },
  sports: { id: 'demo-cat-sports', name: 'Sports', slug: 'sports-and-outdoors' },
  clothing: { id: 'demo-cat-cloth', name: 'Fashion', slug: 'clothing' },
} satisfies Record<string, CategoryRef>;

type CatKey = keyof typeof demoCategories;

/** `useCategories()`-shaped rows (the full DB row type is not needed by screens). */
export const demoCategoryList = Object.values(demoCategories).map((c, i) => ({
  ...c,
  status: 'active' as const,
  sortOrder: i * 10,
  createdAt: NOW - 90 * D,
  updatedAt: NOW - 90 * D,
}));

/* ----------------------------------------------------------------- users -- */

const face = (id: string) =>
  `https://images.unsplash.com/${id}?w=160&h=160&q=70&auto=format&fit=crop&crop=faces`;

export const demoUsers = {
  kishore: {
    id: 'demo-u-kishore',
    displayName: 'Kishore Kumar',
    username: 'kishore',
    locationCity: 'Chennai',
    avatarUrl: face('photo-1506794778202-cad84cf45f1d'),
  },
  arjun: {
    id: 'demo-u-arjun',
    displayName: 'Arjun Mehta',
    username: 'arjun.m',
    locationCity: 'Bengaluru',
    avatarUrl: face('photo-1500648767791-00dcc994a43e'),
  },
  priya: {
    id: 'demo-u-priya',
    displayName: 'Priya Nair',
    username: 'priyanair',
    locationCity: 'Kochi',
    avatarUrl: face('photo-1494790108377-be9c29b29330'),
  },
  meera: {
    id: 'demo-u-meera',
    displayName: 'Meera Iyer',
    username: 'meera.makes',
    locationCity: 'Chennai',
    avatarUrl: face('photo-1438761681033-6461ffad8d80'),
  },
  rahul: {
    id: 'demo-u-rahul',
    displayName: 'Rahul Verma',
    username: 'rahulv',
    locationCity: 'Pune',
    avatarUrl: face('photo-1507003211169-0a1dd7228f2d'),
  },
  ananya: {
    id: 'demo-u-ananya',
    displayName: 'Ananya Rao',
    username: 'ananya',
    locationCity: 'Hyderabad',
    avatarUrl: face('photo-1544005313-94ddf0286df2'),
  },
  vikram: {
    id: 'demo-u-vikram',
    displayName: 'Vikram Singh',
    username: 'vik.rides',
    locationCity: 'Bengaluru',
    avatarUrl: face('photo-1472099645785-5658abf4ff4e'),
  },
  sana: {
    id: 'demo-u-sana',
    displayName: 'Sana Sheikh',
    username: 'sana.s',
    locationCity: 'Mumbai',
    avatarUrl: face('photo-1534528741775-53994a69daeb'),
  },
} satisfies Record<string, OwnerRef>;

type UserKey = keyof typeof demoUsers;

/** The signed-in demo member. */
export const DEMO_ME: UserKey = 'kishore';

/* ------------------------------------------------------------- listings -- */

const photo = (id: string) => `https://images.unsplash.com/${id}?w=900&q=75&auto=format&fit=crop`;

interface Seed {
  id: string;
  owner: UserKey;
  cat: CatKey;
  title: string;
  description: string;
  type?: ItemType;
  img?: string;
  /** Asking price in rupees — only for listings open to sale. */
  price?: number;
  ageH: number;
}

function listing(s: Seed): MarketItem {
  const created = NOW - s.ageH * H;
  return {
    id: s.id,
    kind: 'listing',
    ownerId: demoUsers[s.owner].id,
    type: s.type ?? 'product',
    title: s.title,
    description: s.description,
    status: 'published',
    createdAt: created,
    updatedAt: created,
    owner: demoUsers[s.owner],
    category: demoCategories[s.cat],
    pricing: {
      transactionType: s.price ? 'both' : 'barter',
      priceAmount: s.price ? s.price * 100 : null,
      priceCurrency: 'INR',
    },
    images: s.img ? [{ id: `${s.id}-img`, url: photo(s.img), sortOrder: 0 }] : [],
  };
}

function need(s: Seed): MarketItem {
  const created = NOW - s.ageH * H;
  return {
    id: s.id,
    kind: 'need',
    ownerId: demoUsers[s.owner].id,
    type: s.type ?? 'product',
    title: s.title,
    description: s.description,
    status: 'published',
    createdAt: created,
    updatedAt: created,
    owner: demoUsers[s.owner],
    category: demoCategories[s.cat],
  };
}

export const demoListings: MarketItem[] = [
  listing({
    id: 'demo-l-canon',
    owner: 'kishore',
    cat: 'photography',
    title: 'Canon EOS 200D with 18–55mm kit lens',
    description:
      'Around 8k shutter count, always used with a strap and a UV filter. Comes with two batteries, charger and a padded bag.',
    img: 'photo-1516035069371-29a1b244cc32',
    price: 32000,
    ageH: 5,
  }),
  listing({
    id: 'demo-l-macbook',
    owner: 'arjun',
    cat: 'technology',
    title: 'MacBook Air M1, 8GB / 256GB',
    description:
      'Space grey, battery at 91%. No dents, screen is perfect. Moving to a desktop setup so this is spare.',
    img: 'photo-1517336714731-489689fd1ca8',
    price: 52000,
    ageH: 9,
  }),
  listing({
    id: 'demo-l-sony-xm4',
    owner: 'priya',
    cat: 'electronics',
    title: 'Sony WH-1000XM4 noise-cancelling headphones',
    description: 'Black, with the hard case and cable. Ear pads replaced last month.',
    img: 'photo-1505740420928-5e560c06d30e',
    price: 14500,
    ageH: 20,
  }),
  listing({
    id: 'demo-l-nike',
    owner: 'rahul',
    cat: 'clothing',
    title: 'Nike Air Zoom Pegasus, UK 9',
    description: 'Worn for about 60km. Too narrow for me — cushioning is still great.',
    img: 'photo-1542291026-7eec264c27ff',
    price: 4200,
    ageH: 30,
  }),
  listing({
    id: 'demo-l-bike',
    owner: 'vikram',
    cat: 'sports',
    title: 'Hybrid city bicycle, 21-speed',
    description:
      'Serviced in June — new chain and brake pads. Includes a rear rack and a front light.',
    img: 'photo-1485965120184-e220f721d03e',
    price: 9000,
    ageH: 12,
  }),
  listing({
    id: 'demo-l-controller',
    owner: 'sana',
    cat: 'gaming',
    title: 'PS5 DualSense controller + 2 games',
    description: 'Controller has no drift. Games: Spider-Man: Miles Morales and Ratchet & Clank.',
    img: 'photo-1606144042614-b2417e99c4e3',
    ageH: 44,
  }),
  listing({
    id: 'demo-l-iphone',
    owner: 'ananya',
    cat: 'electronics',
    title: 'iPhone 12, 128GB, blue',
    description: 'Battery health 86%. Always in a case, screen protector since day one.',
    img: 'photo-1511707171634-5f897ff02aa9',
    price: 26000,
    ageH: 60,
  }),
  listing({
    id: 'demo-l-watch',
    owner: 'meera',
    cat: 'clothing',
    title: 'Minimal leather-strap analog watch',
    description: 'Gift I never wear. Tan strap, cream dial, sapphire glass.',
    img: 'photo-1523275335684-37898b6baf30',
    ageH: 26,
  }),
  listing({
    id: 'demo-l-books',
    owner: 'priya',
    cat: 'books',
    title: 'Stack of 12 literary fiction paperbacks',
    description: 'Murakami, Ishiguro, Arundhati Roy and more. Happy to swap the lot or split.',
    img: 'photo-1512820790803-83ca734da794',
    ageH: 72,
  }),
  listing({
    id: 'demo-l-guitar',
    owner: 'rahul',
    cat: 'music',
    title: 'Yamaha F310 acoustic guitar',
    description: 'Warm tone, recently restrung. Comes with a gig bag and a capo.',
    img: 'photo-1510915361894-db8b60106cb1',
    price: 6500,
    ageH: 16,
  }),
  listing({
    id: 'demo-l-chair',
    owner: 'meera',
    cat: 'furniture',
    title: 'Mid-century accent armchair',
    description: 'Solid wood frame, mustard upholstery. Pickup from Adyar.',
    img: 'photo-1567538096630-e0c55bd6374c',
    ageH: 50,
  }),
  listing({
    id: 'demo-l-monstera',
    owner: 'ananya',
    cat: 'home',
    title: 'Monstera deliciosa in terracotta pot',
    description: 'About 90cm tall, six big leaves and a new one unfurling.',
    img: 'photo-1485955900006-10f4d324d411',
    ageH: 8,
  }),
  listing({
    id: 'demo-l-coffee',
    owner: 'sana',
    cat: 'home',
    title: 'Stovetop espresso set + hand grinder',
    description: 'Bialetti Moka 6-cup and a ceramic burr grinder. Selling as a pair.',
    img: 'photo-1495474472287-4d71bcdd2085',
    ageH: 90,
  }),
  listing({
    id: 'demo-l-dumbbells',
    owner: 'vikram',
    cat: 'sports',
    title: 'Adjustable dumbbells, 2 × 12kg',
    description: 'Chrome handles, spin-lock collars. Barely used since I joined a gym.',
    img: 'photo-1583454110551-21f2fa2afe61',
    price: 3500,
    ageH: 110,
  }),
  listing({
    id: 'demo-l-polaroid',
    owner: 'meera',
    cat: 'photography',
    title: 'Polaroid instant camera (white)',
    description: 'Works perfectly. Includes one unopened film pack.',
    img: 'photo-1526170375885-4d8ecf77b99f',
    ageH: 36,
  }),
  listing({
    id: 'demo-l-keyboard',
    owner: 'arjun',
    cat: 'technology',
    title: 'Mechanical keyboard, brown switches',
    description: 'Tenkeyless, PBT keycaps, USB-C. Great for writing and code.',
    img: 'photo-1587829741301-dc798b83add3',
    price: 4800,
    ageH: 28,
  }),
  listing({
    id: 'demo-l-drone',
    owner: 'vikram',
    cat: 'photography',
    title: 'Compact camera drone with 3 batteries',
    description: 'Under 250g, 4K video. Registered and never crashed.',
    img: 'photo-1473968512647-3e447244af8f',
    price: 28000,
    ageH: 140,
  }),
  listing({
    id: 'demo-l-ipad',
    owner: 'sana',
    cat: 'technology',
    title: 'iPad 9th gen + Apple Pencil',
    description: '64GB Wi-Fi, silver. Pencil is first-gen. Folio case included.',
    img: 'photo-1544244015-0df4b3ffc6b0',
    price: 21000,
    ageH: 18,
  }),
  listing({
    id: 'demo-l-lamp',
    owner: 'ananya',
    cat: 'furniture',
    title: 'Brass reading lamp',
    description: 'Adjustable arm, warm-white bulb included.',
    img: 'photo-1507473885765-e6ed057f782c',
    ageH: 64,
  }),
  listing({
    id: 'demo-l-sofa',
    owner: 'priya',
    cat: 'furniture',
    title: 'Two-seater linen sofa',
    description: 'Oat-coloured, removable covers washed last week.',
    img: 'photo-1555041469-a586c61ea9bc',
    ageH: 170,
  }),
  listing({
    id: 'demo-l-controller2',
    owner: 'kishore',
    cat: 'gaming',
    title: 'Xbox wireless controller',
    description: 'Carbon black, includes rechargeable battery pack.',
    img: 'photo-1486401899868-0e435ed85128',
    ageH: 80,
  }),
  listing({
    id: 'demo-l-guitar-lessons',
    owner: 'rahul',
    cat: 'skills',
    type: 'skill',
    title: 'Beginner guitar lessons (4 sessions)',
    description: 'Chords, strumming and your first three songs. In person in Pune or on video.',
    img: 'photo-1525201548942-d8732f6617a0',
    ageH: 40,
  }),
  listing({
    id: 'demo-l-portraits',
    owner: 'kishore',
    cat: 'services',
    type: 'service',
    title: 'Portrait session, 1 hour, edited photos',
    description: 'Outdoor natural-light portraits, 20 edited images delivered in a week.',
    img: 'photo-1554048612-b6a482bc67e5',
    ageH: 3,
  }),
  listing({
    id: 'demo-l-tennis',
    owner: 'meera',
    cat: 'sports',
    title: 'Tennis racquet + can of balls',
    description: 'Wilson, grip size 2. Restrung this season.',
    img: 'photo-1622279457486-62dcc4a431d6',
    ageH: 96,
  }),
  listing({
    id: 'demo-l-airfryer',
    owner: 'arjun',
    cat: 'home',
    title: 'Air fryer toaster oven, 25L',
    description: 'Used a handful of times. Digital controls, non-stick basket.',
    img: 'photo-1574269909862-7e1d70bb8078',
    price: 3800,
    ageH: 120,
  }),
  listing({
    id: 'demo-l-vinyl',
    owner: 'priya',
    cat: 'music',
    title: 'Turntable with 10 vinyl records',
    description: 'Belt-drive, built-in preamp. Jazz and old Bollywood records.',
    img: 'photo-1461360228754-6e81c478b882',
    ageH: 52,
  }),
];

export const demoNeeds: MarketItem[] = [
  need({
    id: 'demo-n-kishore-macbook',
    owner: 'kishore',
    cat: 'technology',
    title: 'A MacBook for photo editing',
    description: 'Anything M1 or newer. Lightroom is killing my old laptop.',
    ageH: 6,
  }),
  need({
    id: 'demo-n-kishore-guitar',
    owner: 'kishore',
    cat: 'music',
    title: 'An acoustic guitar to learn on',
    description: 'Nothing fancy — something that stays in tune.',
    ageH: 48,
  }),
  need({
    id: 'demo-n-arjun-camera',
    owner: 'arjun',
    cat: 'photography',
    title: 'A DSLR or mirrorless camera',
    description: 'Want to start shooting street photography on weekends.',
    ageH: 10,
  }),
  need({
    id: 'demo-n-rahul-controller',
    owner: 'rahul',
    cat: 'gaming',
    title: 'A game controller for PC',
    description: 'Xbox-style preferred.',
    ageH: 22,
  }),
  need({
    id: 'demo-n-rahul-portraits',
    owner: 'rahul',
    cat: 'services',
    type: 'service',
    title: 'Portrait photos for my band',
    description: 'Need a few good shots for our first gig poster.',
    ageH: 14,
  }),
  need({
    id: 'demo-n-priya-plant',
    owner: 'priya',
    cat: 'home',
    title: 'Big leafy indoor plant',
    description: 'For a bright corner in the living room.',
    ageH: 30,
  }),
  need({
    id: 'demo-n-ananya-headphones',
    owner: 'ananya',
    cat: 'electronics',
    title: 'Noise-cancelling headphones',
    description: 'For flights and open-plan office days.',
    ageH: 12,
  }),
  need({
    id: 'demo-n-vikram-ipad',
    owner: 'vikram',
    cat: 'technology',
    title: 'A tablet for sketching routes',
    description: 'Pencil support is a must.',
    ageH: 40,
  }),
  need({
    id: 'demo-n-sana-bike',
    owner: 'sana',
    cat: 'sports',
    title: 'A city bicycle',
    description: 'For the 5km commute — gears would be nice.',
    ageH: 20,
  }),
];

export const demoAllItems = [...demoListings, ...demoNeeds];

export function demoItem(id: string): MarketItem | undefined {
  return demoAllItems.find((i) => i.id === id);
}

const me = demoUsers[DEMO_ME];
export const demoMyListings = demoListings.filter((l) => l.ownerId === me.id);
export const demoMyNeeds = demoNeeds.filter((n) => n.ownerId === me.id);
export const demoOthersListings = demoListings.filter((l) => l.ownerId !== me.id);

/* -------------------------------------------------------------- matches -- */

const ref = (id: string) => {
  const it = demoItem(id)!;
  return {
    id: it.id,
    title: it.title,
    type: it.type,
    category: it.category,
    imageUrl: it.images?.[0]?.url ?? null,
  };
};

function match(
  themKey: UserKey,
  youHave: string,
  youNeed: string,
  themHave: string,
  themNeed: string,
): ReciprocalMatchView {
  return {
    key: `demo-m-${themKey}`,
    you: { user: me, have: ref(youHave), need: ref(youNeed) },
    them: { user: demoUsers[themKey], have: ref(themHave), need: ref(themNeed) },
  };
}

/** Kishore ↔ Arjun is the canonical demo: Canon for MacBook. */
export const demoMatches: ReciprocalMatchView[] = [
  match('arjun', 'demo-l-canon', 'demo-n-kishore-macbook', 'demo-l-macbook', 'demo-n-arjun-camera'),
  match(
    'rahul',
    'demo-l-portraits',
    'demo-n-kishore-guitar',
    'demo-l-guitar',
    'demo-n-rahul-portraits',
  ),
];

/* ---------------------------------------------------------------- offers -- */

export const demoOffers: OfferView[] = [
  {
    id: 'demo-o-1',
    status: 'pending',
    isMine: false,
    fromUser: demoUsers.arjun,
    toUser: me,
    offered: ref('demo-l-macbook'),
    requested: ref('demo-l-canon'),
    message: 'Straight swap? I can meet in Chennai next weekend — I am there for a wedding.',
    matchId: 'demo-m-arjun',
    parentOfferId: null,
    counterOfferId: null,
    requestedKind: 'listing',
    imageUrl: null,
    conversationId: null,
    expiresAt: NOW + 5 * D,
    respondedAt: null,
    createdAt: NOW - 2 * H,
    updatedAt: NOW - 2 * H,
  },
  {
    id: 'demo-o-2',
    status: 'pending',
    isMine: true,
    fromUser: me,
    toUser: demoUsers.rahul,
    offered: ref('demo-l-controller2'),
    requested: ref('demo-l-guitar'),
    message: 'Controller + a portrait session for the guitar?',
    matchId: null,
    parentOfferId: null,
    counterOfferId: null,
    requestedKind: 'listing',
    imageUrl: null,
    conversationId: null,
    expiresAt: NOW + 3 * D,
    respondedAt: null,
    createdAt: NOW - 20 * H,
    updatedAt: NOW - 20 * H,
  },
  {
    id: 'demo-o-3',
    status: 'accepted',
    isMine: false,
    fromUser: demoUsers.priya,
    toUser: me,
    offered: ref('demo-l-books'),
    requested: ref('demo-l-portraits'),
    message: null,
    matchId: null,
    parentOfferId: null,
    counterOfferId: null,
    requestedKind: 'listing',
    imageUrl: null,
    conversationId: null,
    expiresAt: null,
    respondedAt: NOW - 3 * D,
    createdAt: NOW - 4 * D,
    updatedAt: NOW - 3 * D,
  },
];

/* --------------------------------------------------------- conversations -- */

function msg(id: string, conv: string, from: UserKey, body: string, agoMin: number): MessageView {
  return {
    id,
    conversationId: conv,
    senderId: demoUsers[from].id,
    isMine: from === DEMO_ME,
    body,
    imageUrl: null,
    createdAt: NOW - agoMin * 60 * 1000,
    editedAt: null,
  };
}

export const demoMessages: Record<string, MessageView[]> = {
  'demo-c-arjun': [
    msg(
      'demo-msg-1',
      'demo-c-arjun',
      'arjun',
      'Hey! Saw the Canon — is the shutter count really ~8k?',
      150,
    ),
    msg(
      'demo-msg-2',
      'demo-c-arjun',
      'kishore',
      'Yes, I can send a screenshot from the EXIF tool.',
      140,
    ),
    msg(
      'demo-msg-3',
      'demo-c-arjun',
      'arjun',
      'Perfect. MacBook battery is at 91%, happy to video-call and show it.',
      128,
    ),
    msg(
      'demo-msg-4',
      'demo-c-arjun',
      'kishore',
      'Sounds fair. Saturday near T. Nagar works for me.',
      20,
    ),
  ],
  'demo-c-priya': [
    msg(
      'demo-msg-5',
      'demo-c-priya',
      'priya',
      'Thank you for the photos, they came out lovely!',
      3 * 24 * 60,
    ),
    msg(
      'demo-msg-6',
      'demo-c-priya',
      'kishore',
      'Enjoy the books — the Ishiguro was my favourite.',
      3 * 24 * 60 - 30,
    ),
  ],
};

export const demoConversations: ConversationView[] = [
  {
    id: 'demo-c-arjun',
    status: 'active',
    offerId: 'demo-o-1',
    participants: [demoUsers.arjun],
    lastMessage: demoMessages['demo-c-arjun']!.at(-1)!,
    unread: true,
    unreadCount: 1,
    createdAt: NOW - 3 * H,
    updatedAt: NOW - 20 * 60 * 1000,
  },
  {
    id: 'demo-c-priya',
    status: 'active',
    offerId: 'demo-o-3',
    participants: [demoUsers.priya],
    lastMessage: demoMessages['demo-c-priya']!.at(-1)!,
    unread: false,
    unreadCount: 0,
    createdAt: NOW - 4 * D,
    updatedAt: NOW - 3 * D,
  },
];

/* ---------------------------------------------------------- notifications -- */
