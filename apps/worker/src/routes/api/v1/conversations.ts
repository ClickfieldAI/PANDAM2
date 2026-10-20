/**
 * `/api/v1/conversations` — negotiation threads created automatically when an
 * offer is accepted (see `routes/api/v1/offers.ts`). Storage + REST only in
 * this phase; realtime delivery (WebSockets / Durable Objects) is later.
 *
 *   GET  /                        every conversation the caller is in
 *   GET  /:id                     one conversation (a participant only)
 *   POST /:id/read                mark the caller's read position current
 *   GET  /:id/messages            messages, oldest first
 *   POST /:id/messages            send a message
 *   POST /:id/attachments         upload an optional photo for a message (auth)
 *   GET  /:id/typing              whether another participant is typing
 *   POST /:id/typing              signal the caller's own typing state
 */
import {
  type ConversationView,
  type MessageView,
  type OwnerRef,
  type TypingStatusView,
} from '@pandam/types';
import { createMessageSchema, setTypingSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { mediaUrl, readUploadedImage, requireMedia } from '../../../lib/media';
import { toOwnerRef } from '../../../lib/serialize';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { assertCanInteract } from '../../../services/blocks';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

export const conversationsRoute = new Hono<AppEnv>();

async function requireParticipant(c: Context<AppEnv>, conversationId: string, userId: string) {
  const { repos } = c.get('ctx');
  const conversation = await repos.conversations.findById(conversationId);
  if (!conversation) throw new ApiError('not_found', 'That conversation does not exist.');
  const isIn = await repos.conversations.isParticipant(conversationId, userId);
  if (!isIn) throw new ApiError('not_found', 'That conversation does not exist.');
  return conversation;
}

conversationsRoute.get('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  // No "list my conversations" query exists on the repo yet (it only supports
  // lookups by id/offer); every conversation currently starts from an
  // accepted offer, so derive the list from the caller's offers.
  const [incoming, outgoing] = await Promise.all([
    repos.offers.listIncoming(user.id, 'accepted'),
    repos.offers.listOutgoing(user.id, 'accepted'),
  ]);
  const offerIds = [...incoming, ...outgoing].map((o) => o.id);
  const conversations = (
    await Promise.all(offerIds.map((id) => repos.conversations.findByOffer(id)))
  ).filter((cv): cv is NonNullable<typeof cv> => cv !== null);

  const items = await Promise.all(conversations.map((cv) => hydrate(c, cv, user.id)));
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return sendOk(c, { items });
});

conversationsRoute.get('/:id', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  return sendOk(c, { conversation: await hydrate(c, conversation, user.id) });
});

conversationsRoute.post('/:id/read', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  await repos.conversations.markRead(conversation.id, user.id);
  return sendOk(c, { read: true });
});

/**
 * One message as the caller sees it. For the caller's OWN messages it adds the
 * retry id they chose and whether every other participant has read up to it —
 * evidence taken from the other person's read marker, never assumed. Other
 * people's messages carry neither, so a reader never learns anything about
 * the sender's app, and nobody's read marker is exposed raw.
 */
function toMessageView(
  m: {
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    imageKey: string | null;
    clientId: string | null;
    createdAt: number;
    editedAt: number | null;
  },
  meId: string,
  participants: { userId: string; lastReadAt: number | null }[],
): MessageView {
  const mine = m.senderId === meId;
  const others = participants.filter((p) => p.userId !== meId);
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    isMine: mine,
    body: m.body,
    imageUrl: m.imageKey ? mediaUrl(m.imageKey) : null,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    ...(mine
      ? {
          clientId: m.clientId,
          readByRecipient:
            others.length > 0 &&
            others.every((p) => p.lastReadAt !== null && p.lastReadAt >= m.createdAt),
        }
      : {}),
  };
}

conversationsRoute.get('/:id/messages', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const [rows, participants] = await Promise.all([
    repos.messages.listByConversation(conversation.id),
    repos.conversations.listParticipants(conversation.id),
  ]);
  const items = rows
    .filter((m) => !m.deletedAt)
    .map((m) => toMessageView(m, user.id, participants));
  return sendOk(c, { items });
});

/**
 * Upload the optional photo for a message BEFORE sending it; returns the key
 * to pass as `imageKey`. Keys are scoped to the uploader
 * (`messages/<userId>/`), mirroring `POST /offers/attachments`.
 */
conversationsRoute.post('/:id/attachments', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  await requireParticipant(c, c.req.param('id'), user.id);
  const bucket = requireMedia(c.env);
  const { bytes, contentType, extension } = await readUploadedImage(c.req.raw);
  const key = `messages/${user.id}/${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  return sendOk(c, { imageKey: key, imageUrl: mediaUrl(key) }, 201);
});

conversationsRoute.post('/:id/messages', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const { body, imageKey, clientId } = await parseBody(c, createMessageSchema);

  // Retry safety, checked FIRST: if this exact message (same retry id) was
  // already stored, return it — even if the conversation has since been
  // archived or a block placed. The sender must learn it DID go through, and
  // the recipient must not be notified a second time.
  const participants = await repos.conversations.listParticipants(conversation.id);
  if (clientId) {
    const existing = await repos.messages.findByClientId(user.id, clientId);
    if (existing) {
      if (existing.conversationId !== conversation.id) {
        throw new ApiError('conflict', 'That message id was already used in another conversation.');
      }
      return sendOk(
        c,
        { message: toMessageView(existing, user.id, participants), replayed: true },
        200,
      );
    }
  }

  if (conversation.status === 'archived') {
    throw new ApiError('unprocessable', 'This conversation is archived.');
  }
  // A block (either way) ends messaging; an already-agreed trade can still be confirmed or cancelled.
  for (const p of participants) {
    if (p.userId !== user.id) await assertCanInteract(c, user.id, p.userId);
  }
  if (imageKey && !imageKey.startsWith(`messages/${user.id}/`)) {
    throw new ApiError('forbidden', 'That image was not uploaded by you.');
  }

  let message;
  try {
    message = await repos.messages.create({
      conversationId: conversation.id,
      senderId: user.id,
      body: body?.trim() ?? '',
      imageKey: imageKey ?? null,
      clientId: clientId ?? null,
    });
  } catch (error) {
    // Two identical sends racing: the unique index lets exactly one in; the
    // other gets the stored message back and notifies no one.
    const winner = clientId ? await repos.messages.findByClientId(user.id, clientId) : null;
    if (winner) {
      return sendOk(
        c,
        { message: toMessageView(winner, user.id, participants), replayed: true },
        200,
      );
    }
    throw error;
  }

  await Promise.all(
    participants
      .filter((p) => p.userId !== user.id)
      .map((p) =>
        notify(c, {
          userId: p.userId,
          type: 'message_received',
          data: { conversationId: conversation.id, messageId: message.id },
        }),
      ),
  );

  return sendOk(
    c,
    { message: toMessageView(message, user.id, participants), replayed: false },
    201,
  );
});

/**
 * How long a typing signal stays live without a refresh. The client debounces
 * its own "stop" event, but this is the server-side safety net: if a stop
 * event (or the client itself) never arrives, the indicator still clears
 * within this window rather than staying stuck on forever.
 */
const TYPING_TTL_MS = 6_000;

conversationsRoute.get('/:id/typing', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const participants = await repos.conversations.listParticipants(conversation.id);
  const typing = participants.some(
    (p) => p.userId !== user.id && p.typingAt !== null && Date.now() - p.typingAt < TYPING_TTL_MS,
  );
  const view: TypingStatusView = { typing };
  return sendOk(c, view);
});

conversationsRoute.post('/:id/typing', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const { typing } = await parseBody(c, setTypingSchema);
  if (typing) {
    await repos.conversations.setTyping(conversation.id, user.id);
  } else {
    await repos.conversations.clearTyping(conversation.id, user.id);
  }
  return sendOk(c, { typing });
});

async function hydrate(
  c: Context<AppEnv>,
  conversation: {
    id: string;
    offerId: string | null;
    status: string;
    createdAt: number;
    updatedAt: number;
  },
  meId: string,
): Promise<ConversationView> {
  const { repos } = c.get('ctx');
  const [participants, lastMessages, me] = await Promise.all([
    repos.conversations.listParticipants(conversation.id),
    repos.messages.listByConversation(conversation.id),
    repos.conversations
      .listParticipants(conversation.id)
      .then((ps) => ps.find((p) => p.userId === meId)),
  ]);

  const others = participants.filter((p) => p.userId !== meId);
  const otherRefs: OwnerRef[] = await Promise.all(
    others.map(async (p) => toOwnerRef(p.userId, await repos.profiles.findByUserId(p.userId))),
  );

  const visible = lastMessages.filter((m) => !m.deletedAt);
  const last = visible[visible.length - 1] ?? null;
  const lastReadAt = me?.lastReadAt ?? null;
  // How many of the OTHER people's messages arrived after the caller last read.
  const unreadCount = visible.filter(
    (m) => m.senderId !== meId && (lastReadAt === null || m.createdAt > lastReadAt),
  ).length;

  return {
    id: conversation.id,
    status: conversation.status as ConversationView['status'],
    offerId: conversation.offerId,
    participants: otherRefs,
    lastMessage: last ? toMessageView(last, meId, participants) : null,
    unread: unreadCount > 0,
    unreadCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}
