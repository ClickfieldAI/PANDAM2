/**
 * The tour's content. Every `target` is the id of a real `<TourTarget>`
 * mounted on the screen named by `route` — nothing here is a screenshot.
 */
export type TourTargetId =
  | 'home-search'
  | 'home-intent'
  | 'tab-bar'
  | 'tab-create'
  | 'profile-settings'
  | 'profile-trading'
  | 'profile-replay';

export interface TourStep {
  target: TourTargetId;
  /** Expo Router href the step lives on. */
  route: string;
  title: string;
  body: string;
  /** What the user can do with the highlighted element. */
  action: string;
}

const HOME = '/(app)/(tabs)';
const PROFILE = '/(app)/(tabs)/profile';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'home-search',
    route: HOME,
    title: 'Search the marketplace',
    body: 'See what other people are offering — cameras, skills, furniture and more.',
    action: 'Tap the bar to open Discover and start searching.',
  },
  {
    target: 'home-intent',
    route: HOME,
    title: 'I have · I need',
    body: 'List something you can offer, or post something you are looking for. PANDAM looks for reciprocal matches between the two.',
    action: 'Tap “I have” or “I need” to add your first item.',
  },
  {
    target: 'tab-bar',
    route: HOME,
    title: 'Move around',
    body: 'Home, Discover, Matches and Profile live in this bar. The badge on Matches shows how many trades were found for you.',
    action: 'Tap a tab to switch sections.',
  },
  {
    target: 'tab-create',
    route: HOME,
    title: 'Add something',
    body: 'The orange button takes you to the create screen, where you add a thing you have or a thing you need.',
    action: 'Tap + whenever you want to list something.',
  },
  {
    target: 'profile-settings',
    route: PROFILE,
    title: 'Account & security',
    body: 'Manage your signed-in devices, password and account from here.',
    action: 'Tap the gear to open your account settings.',
  },
  {
    target: 'profile-trading',
    route: PROFILE,
    title: 'Your trading',
    body: 'Matches, offers, messages, transactions and notifications are all one tap away.',
    action: 'Tap a row to jump straight to that part of your trading.',
  },
  {
    target: 'profile-replay',
    route: PROFILE,
    title: 'Replay this tour',
    body: 'Forgot something? You can run this walkthrough again at any time.',
    action: 'Tap “Take the app tour” to see it again.',
  },
];
