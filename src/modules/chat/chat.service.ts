import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  MessagePage,
  MessageResponse,
  ReactionSummary,
  ThreadCreatedResponse,
  ThreadSummary,
} from './types/chat-response.type';

const SENDER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  threadId: true,
  content: true,
  createdAt: true,
  sender: { select: SENDER_SELECT },
  reactions: { select: { emoji: true, userId: true } },
} as const;

const PARTICIPANT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

// Groups raw reaction rows into ReactionSummary[]
function summarizeReactions(
  raw: { emoji: string; userId: string }[],
): ReactionSummary[] {
  const map = new Map<string, string[]>();
  for (const r of raw) {
    const arr = map.get(r.emoji) ?? [];
    arr.push(r.userId);
    map.set(r.emoji, arr);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

function toMessageResponse(raw: any): MessageResponse {
  return {
    id: raw.id,
    threadId: raw.threadId,
    content: raw.content,
    createdAt: raw.createdAt,
    sender: raw.sender,
    reactions: summarizeReactions(raw.reactions ?? []),
  };
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async createThread(
    creatorId: string,
    dto: CreateThreadDto,
  ): Promise<ThreadCreatedResponse> {
    const allIds = [...new Set([creatorId, ...dto.participantIds])];

    if (!dto.isGroup && allIds.length !== 2) {
      throw new BadRequestException('DM requires exactly one other participant');
    }

    // DM dedup: return existing 1:1 thread rather than creating a duplicate
    if (!dto.isGroup) {
      const existing = await this.prisma.chatThread.findFirst({
        where: {
          isGroup: false,
          AND: allIds.map((id) => ({ participants: { some: { userId: id } } })),
        },
        select: {
          id: true,
          isGroup: true,
          name: true,
          createdAt: true,
          participants: {
            select: { userId: true, user: { select: PARTICIPANT_USER_SELECT } },
          },
        },
      });

      if (existing && existing.participants.length === 2) {
        return {
          id: existing.id,
          isGroup: existing.isGroup,
          name: existing.name,
          createdAt: existing.createdAt,
          participants: existing.participants.map((p) => p.user),
          isNew: false,
        };
      }
    }

    // Verify all participant IDs are real, active users
    const users = await this.prisma.user.findMany({
      where: { id: { in: allIds }, isActive: true },
      select: PARTICIPANT_USER_SELECT,
    });
    if (users.length !== allIds.length) {
      throw new NotFoundException('One or more participants not found');
    }

    const thread = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatThread.create({
        data: {
          isGroup: dto.isGroup ?? false,
          name: dto.name,
          participants: {
            createMany: {
              data: allIds.map((userId) => ({ userId })),
            },
          },
        },
        select: { id: true, isGroup: true, name: true, createdAt: true },
      });
      return created;
    });

    return {
      ...thread,
      participants: users,
      isNew: true,
    };
  }

  // Single raw query: thread list + last message + unread count per thread.
  async getThreads(userId: string): Promise<ThreadSummary[]> {
    return this.prisma.$queryRaw<ThreadSummary[]>(Prisma.sql`
      SELECT
        ct.id,
        ct.is_group                                                         AS "isGroup",
        ct.name,
        ct.updated_at                                                       AS "updatedAt",
        (
          SELECT row_to_json(lm)
          FROM (
            SELECT m.id, m.content,
                   m.created_at  AS "createdAt",
                   m.sender_id   AS "senderId"
            FROM   messages m
            WHERE  m.thread_id  = ct.id
              AND  m.is_deleted = false
            ORDER  BY m.created_at DESC
            LIMIT  1
          ) lm
        )                                                                   AS "lastMessage",
        COALESCE((
          SELECT COUNT(*)::int
          FROM   messages m
          WHERE  m.thread_id  = ct.id
            AND  m.is_deleted = false
            AND  m.sender_id != ${userId}
            AND  m.created_at > COALESCE(cp.last_read_at, '-infinity'::timestamptz)
        ), 0)                                                               AS "unreadCount",
        COALESCE((
          SELECT json_agg(row_to_json(p) ORDER BY p.username)
          FROM (
            SELECT u.id,
                   u.username,
                   u.display_name  AS "displayName",
                   u.avatar_url    AS "avatarUrl",
                   u.is_verified   AS "isVerified"
            FROM   chat_participants cp2
            JOIN   users u ON u.id = cp2.user_id
            WHERE  cp2.thread_id = ct.id
          ) p
        ), '[]'::json)                                                      AS participants
      FROM   chat_threads ct
      JOIN   chat_participants cp
             ON  cp.thread_id = ct.id
             AND cp.user_id   = ${userId}
      ORDER  BY ct.updated_at DESC
    `);
  }

  async getMessages(
    threadId: string,
    userId: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<MessagePage> {
    const isMember = await this.verifyParticipant(threadId, userId);
    if (!isMember) throw new ForbiddenException('Not a participant of this thread');

    const limit = Math.min(Number(rawLimit) || 30, 100);

    const messages = await this.prisma.message.findMany({
      where: { threadId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: MESSAGE_SELECT,
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;

    return {
      data: data.map(toMessageResponse),
      nextCursor: hasMore ? data[data.length - 1].id : null,
      hasMore,
    };
  }

  async sendMessage(
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponse> {
    const isMember = await this.verifyParticipant(dto.threadId, senderId);
    if (!isMember) throw new ForbiddenException('Not a participant of this thread');

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { threadId: dto.threadId, senderId, content: dto.content },
        select: MESSAGE_SELECT,
      });

      await tx.chatThread.update({
        where: { id: dto.threadId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    return toMessageResponse(message);
  }

  async markRead(threadId: string, userId: string): Promise<void> {
    if (!(await this.verifyParticipant(threadId, userId))) {
      throw new ForbiddenException('Not a participant of this thread');
    }
    await this.prisma.chatParticipant.updateMany({
      where: { threadId, userId },
      data: { lastReadAt: new Date() },
    });
  }

  async verifyParticipant(threadId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.chatParticipant.count({
      where: { threadId, userId },
    });
    return count > 0;
  }

  async getThreadParticipantIds(threadId: string): Promise<string[]> {
    const rows = await this.prisma.chatParticipant.findMany({
      where: { threadId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async getMessageThread(
    messageId: string,
  ): Promise<{ threadId: string } | null> {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      select: { threadId: true },
    });
  }

  async toggleReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<ReactionSummary[]> {
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    if (existing) {
      await this.prisma.messageReaction.delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId, emoji },
      });
    }

    const rows = await this.prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });

    return summarizeReactions(rows);
  }
}
