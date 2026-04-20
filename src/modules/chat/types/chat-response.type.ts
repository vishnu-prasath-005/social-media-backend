export interface MessageSender {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageResponse {
  id: string;
  threadId: string;
  content: string;
  createdAt: Date;
  sender: MessageSender;
  reactions: ReactionSummary[];
}

export interface MessagePage {
  data: MessageResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ThreadParticipant {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface LastMessage {
  id: string;
  content: string;
  createdAt: Date;
  senderId: string;
}

export interface ThreadSummary {
  id: string;
  isGroup: boolean;
  name: string | null;
  updatedAt: Date;
  lastMessage: LastMessage | null;
  unreadCount: number;
  participants: ThreadParticipant[];
}

export interface ThreadCreatedResponse {
  id: string;
  isGroup: boolean;
  name: string | null;
  createdAt: Date;
  participants: ThreadParticipant[];
  isNew: boolean;
}
