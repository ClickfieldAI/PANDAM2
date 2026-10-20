# Real-device checklist

Nothing in this project has been verified on a physical iPhone or Android phone **except** what the owner tried by hand in Expo Go on an iPhone early on (sign-in, browsing). Every box below is therefore unchecked. Fill in one copy per device and build.

```
Device / OS:            Build (profile + version):
API URL:                Tester / date:
```

Use an `preview` or `development` build for anything involving push, camera or Google/Apple sign-in; Expo Go cannot do those faithfully.

## Install and launch

- [ ] Fresh install launches; no red screen or crash within 60 s
- [ ] Splash hands over to login without a white flash
- [ ] App survives: background 5 min and return; rotate (portrait is locked); kill and relaunch signed in
- [ ] With the API unreachable, the app shows a clear "can't reach the server" state, not a blank screen

## Account

- [ ] Register, sign out, sign in again; wrong password shows a clear error
- [ ] Identity verification (demo) completes and does not reappear
- [ ] Google and Apple sign-in work (_requires configured client ids_)
- [ ] Change password; other devices are signed out; delete account asks for confirmation

## Core trading (two devices)

- [ ] Create listing with camera photo and with library photo; photo upload permission prompts make sense
- [ ] Discover search, category and city filters; images load on cellular
- [ ] Offer → counter → accept; both devices update without manual refresh (within ~15 s)
- [ ] Chat: send, receive, photo attachment, "typing", unread badge
- [ ] Chat offline: airplane mode, send, restore — sends once, no duplicate; force-quit while "waiting", reopen — still sends
- [ ] Confirm both sides → completion animation plays once, then the review prompt
- [ ] Cancel a trade; items return to Discover
- [ ] Deleting a listing with and without history

## Safety and admin

- [ ] Report a listing, a user and a message; block and unblock
- [ ] Moderator account: Moderation entry visible; ordinary account: not visible
- [ ] Suspend/unsuspend, takedown/reinstate, review a report (reason field usable with the keyboard open on a small phone)

## Notifications

- [ ] Push permission prompt appears at a sensible moment; denying it does not break the app
- [ ] Push arrives for: offer received, offer accepted, message (app backgrounded and killed)
- [ ] Tapping a push opens the right screen (offer, chat, transaction)
- [ ] Lock-screen text contains no names or item titles

## Look and feel

- [ ] Light, Dark and System themes: every screen readable, no white-on-white or black-on-black
- [ ] Switching the OS theme while the app is open updates it in System mode
- [ ] OS "Reduce motion" on: confirmation shows a still check, tour and screens do not animate heavily
- [ ] Largest OS text size: no clipped buttons or overlapping rows
- [ ] Small phone (≈ 360 × 640) and large phone/tablet: nothing cut off; keyboard never hides the field being typed in
- [ ] VoiceOver / TalkBack: tabs, buttons and the confirmation message are announced sensibly
- [ ] Hardware back button (Android) behaves: closes modals, does not exit mid-form

## Payments (only if Razorpay is configured, test mode)

- [ ] Buying a `sale` listing opens the Razorpay link; paying with a test card marks it paid after the webhook
- [ ] Cancelling the payment returns cleanly; platform-fee demo clearly says it is a demo

## Performance sanity

- [ ] Discover scrolls smoothly with 50+ items on a mid-range Android phone
- [ ] Cold start to usable home screen in a time you are comfortable with (record it): ____ s

## Sign-off

Blocking issues found: ______________________ Date: __________
