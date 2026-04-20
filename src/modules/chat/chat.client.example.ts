/**
 * Example Socket.IO client for the chat gateway.
 * Runtime dependency: socket.io-client
 *
 *   npm install socket.io-client
 *   npx ts-node src/modules/chat/chat.client.example.ts
 */

import { io, Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessageResponse {
  id: string;
  threadId: string;
  content: string;
  createdAt: string;
  sender: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

// ─── Connection ───────────────────────────────────────────────────────────────

function connect(accessToken: string): Socket {
  const socket = io('http://localhost:3001/chat', {
    // Token can be passed via auth OR Authorization header
    auth: { token: accessToken },
    // Alternatively: extraHeaders: { Authorization: `Bearer ${accessToken}` },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('Connection failed:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
  });

  // Handles auth failures (wrong/expired token)
  socket.on('error', (payload: { message: string }) => {
    console.error('Server error:', payload.message);
  });

  return socket;
}

// ─── Joining a thread room ────────────────────────────────────────────────────

function joinThread(socket: Socket, threadId: string): Promise<{ joined: string }> {
  return new Promise((resolve, reject) => {
    socket.emit('thread:join', threadId, (ack: { joined: string } | { error: string }) => {
      if ('error' in ack) reject(new Error(ack.error));
      else resolve(ack);
    });
  });
}

// ─── Sending a message ────────────────────────────────────────────────────────

function sendMessage(
  socket: Socket,
  threadId: string,
  content: string,
): Promise<MessageResponse> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'message:send',
      { threadId, content },
      (ack: MessageResponse | { error: string }) => {
        if ('error' in ack) reject(new Error(ack.error));
        else resolve(ack);
      },
    );
  });
}

// ─── Listening for incoming messages ─────────────────────────────────────────

function onMessage(socket: Socket, handler: (msg: MessageResponse) => void) {
  // Received while the thread room is active
  socket.on('message:received', handler);
}

function onNewMessageNotification(
  socket: Socket,
  handler: (payload: { threadId: string; message: MessageResponse }) => void,
) {
  // Received via the user room — conversation is not open yet
  socket.on('message:new', handler);
}

// ─── Read receipt ─────────────────────────────────────────────────────────────

function markRead(socket: Socket, threadId: string) {
  socket.emit('thread:read', threadId);
}

function onReadReceipt(
  socket: Socket,
  handler: (payload: { threadId: string; userId: string }) => void,
) {
  socket.on('thread:read', handler);
}

// ─── Full usage example ───────────────────────────────────────────────────────

async function main() {
  // Alice connects with her JWT access token
  const aliceToken = '<alice-access-token>';
  const alice = connect(aliceToken);

  await new Promise<void>((r) => alice.once('connect', r));

  // Open a thread (threadId obtained from REST: POST /api/v1/chat/threads)
  const threadId = '<thread-uuid>';
  await joinThread(alice, threadId);
  console.log('Joined thread:', threadId);

  // Listen for messages from others in this thread
  onMessage(alice, (msg) => {
    console.log(`[thread:${msg.threadId}] ${msg.sender.username}: ${msg.content}`);
    // Mark as read after receiving
    markRead(alice, msg.threadId);
  });

  // Listen for notifications when another thread gets a message (conversation not open)
  onNewMessageNotification(alice, ({ threadId: tid, message }) => {
    console.log(`[notification] New message in thread ${tid} from ${message.sender.username}`);
  });

  // Read receipts from others
  onReadReceipt(alice, ({ threadId: tid, userId }) => {
    console.log(`User ${userId} read thread ${tid}`);
  });

  // Send a message — receives the persisted message (with id + createdAt) as ACK
  const sent = await sendMessage(alice, threadId, 'Hey! How are you?');
  console.log('Sent (ACK):', sent);

  // ─── REST endpoints (for reference) ────────────────────────────────────────
  // Create / find DM thread:   POST   /api/v1/chat/threads
  //                            body:  { participantIds: ["<otherUserId>"] }
  //
  // List user's threads:       GET    /api/v1/chat/threads
  //
  // Fetch message history:     GET    /api/v1/chat/threads/:threadId/messages
  //                            query: ?cursor=<msgId>&limit=30
}

main().catch(console.error);
