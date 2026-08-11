import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, PostType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostQueryDto } from './dto/post-query.dto';
import { FeedResponse, PostResponse } from './types/post-response.type';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

// Returns a Prisma select that includes a filtered likes sub-query so the
// caller can compute `isLiked` without a second round-trip.
function postSelect(userId: string | null) {
  return {
    id: true,
    content: true,
    type: true,
    parentId: true,
    repostOfId: true,
    mediaUrls: true,
    likeCount: true,
    commentCount: true,
    repostCount: true,
    viewCount: true,
    createdAt: true,
    author: { select: AUTHOR_SELECT },
    tags: { select: { tag: { select: { name: true } } } },
    likes: {
      where: { userId: userId ?? '' },
      select: { userId: true },
      take: 1,
    },
  } as const;
}

// Strips the raw `likes` array from the Prisma result and replaces it with
// the boolean `isLiked` that the response type and frontend expect.
function withIsLiked(raw: { likes: { userId: string }[]; [k: string]: unknown }): PostResponse {
  const { likes, ...rest } = raw;
  return { ...rest, isLiked: likes.length > 0 } as PostResponse;
}

const HASHTAG_REGEX = /#(\w{1,100})/g;

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(authorId: string, dto: CreatePostDto): Promise<PostResponse> {
    const content = dto.content?.trim() ?? '';
    const type = dto.type ?? PostType.ORIGINAL;
    if (type !== PostType.REPOST && !content && !(dto.mediaUrls?.length)) {
      throw new BadRequestException('A post must contain text or media');
    }

    await this.validateReferences(type, dto.parentId, dto.repostOfId, content, dto.mediaUrls);

    const contentTags = [...content.matchAll(HASHTAG_REGEX)].map((m) => m[1].toLowerCase());
    const allTags = [...new Set([...contentTags, ...(dto.tags ?? [])])];

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId,
          content,
          type,
          parentId: dto.parentId,
          repostOfId: dto.repostOfId,
          mediaUrls: dto.mediaUrls ?? [],
        },
        select: postSelect(authorId),
      });

      for (const name of allTags) {
        const tag = await tx.tag.upsert({
          where: { name },
          create: { name, postCount: 1 },
          update: { postCount: { increment: 1 } },
          select: { id: true },
        });
        await tx.postTag.create({ data: { postId: created.id, tagId: tag.id } });
      }

      if (type === PostType.REPOST && dto.repostOfId) {
        await tx.post.update({ where: { id: dto.repostOfId }, data: { repostCount: { increment: 1 } } });
      }

      return created;
    });

    this.notifications.broadcastNewPost(authorId, post.id).catch((err) => {
      this.logger.error('Failed to broadcast new post notification', err);
    });

    if (type === PostType.REPOST && dto.repostOfId) {
      this.notifyRepost(authorId, dto.repostOfId, post.id);
    }

    return withIsLiked(post as Parameters<typeof withIsLiked>[0]);
  }

  async findFeed(userId: string, query: PostQueryDto): Promise<FeedResponse> {
    const limit = query.limit ?? 20;
    const isGlobal = query.scope === 'global';

    const follows = isGlobal
      ? []
      : await this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        });
    const feedAuthorIds = isGlobal ? [] : [userId, ...follows.map((f) => f.followingId)];

    const normalizedTags = query.tags?.map((t) => t.toLowerCase());

    const posts = await this.prisma.post.findMany({
      where: {
        ...(isGlobal ? {} : { authorId: { in: feedAuthorIds } }),
        isDeleted: false,
        ...(query.type && { type: query.type }),
        ...(normalizedTags?.length && {
          tags: { some: { tag: { name: { in: normalizedTags } } } },
        }),
      },
      // The global feed is "For You": engagement is the primary signal and
      // recency breaks ties. Following remains chronological.
      orderBy: isGlobal
        ? [{ likeCount: 'desc' }, { repostCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }]
        : { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: postSelect(userId),
    });

    const mapped = posts.map((p) => withIsLiked(p as Parameters<typeof withIsLiked>[0]));
    return this.paginateResult(mapped, limit);
  }

  async findOne(id: string, userId: string | null): Promise<PostResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id, isDeleted: false },
      select: postSelect(userId),
    });

    if (!post) throw new NotFoundException('Post not found');
    return withIsLiked(post as Parameters<typeof withIsLiked>[0]);
  }

  async findByUsername(username: string, userId: string | null, query: PostQueryDto): Promise<FeedResponse> {
    const author = await this.prisma.user.findFirst({
      where: { username, isActive: true },
      select: { id: true },
    });
    if (!author) throw new NotFoundException('User not found');

    const limit = query.limit ?? 20;
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: author.id,
        isDeleted: false,
        ...(query.type && { type: query.type }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: postSelect(userId),
    });
    return this.paginateResult(posts.map((p) => withIsLiked(p as Parameters<typeof withIsLiked>[0])), limit);
  }

  async findReplies(postId: string, userId: string | null, query: PostQueryDto): Promise<FeedResponse> {
    const parent = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Post not found');

    const limit = query.limit ?? 20;

    const posts = await this.prisma.post.findMany({
      where: { parentId: postId, type: PostType.REPLY, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: postSelect(userId),
    });

    const mapped = posts.map((p) => withIsLiked(p as Parameters<typeof withIsLiked>[0]));
    return this.paginateResult(mapped, limit);
  }

  async remove(id: string, authorId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id, isDeleted: false },
      select: { authorId: true, type: true, repostOfId: true, tags: { select: { tagId: true } } },
    });

    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== authorId) throw new ForbiddenException('You do not own this post');

    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id }, data: { isDeleted: true } });

      if (post.type === PostType.REPOST && post.repostOfId) {
        await tx.post.update({ where: { id: post.repostOfId }, data: { repostCount: { decrement: 1 } } });
      }

      if (post.tags.length > 0) {
        await tx.tag.updateMany({
          where: { id: { in: post.tags.map((t) => t.tagId) }, postCount: { gt: 0 } },
          data: { postCount: { decrement: 1 } },
        });
      }
    });
  }

  private paginateResult(posts: PostResponse[], limit: number): FeedResponse {
    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
  }

  private async validateReferences(
    type: PostType,
    parentId?: string,
    repostOfId?: string,
    content = '',
    mediaUrls?: string[],
  ): Promise<void> {
    const requiresParent = type === PostType.REPLY;
    const requiresRepost = type === PostType.REPOST || type === PostType.QUOTE;
    if (requiresParent !== !!parentId || requiresRepost !== !!repostOfId ||
      (!requiresParent && parentId) || (!requiresRepost && repostOfId)) {
      throw new BadRequestException('Post references do not match its type');
    }
    if (type === PostType.REPOST && (content || mediaUrls?.length)) {
      throw new BadRequestException('A repost cannot include text or media; use QUOTE instead');
    }
    if (parentId) {
      const parent = await this.prisma.post.findFirst({ where: { id: parentId, isDeleted: false }, select: { id: true } });
      if (!parent) throw new NotFoundException('Parent post not found');
    }
    if (repostOfId) {
      const original = await this.prisma.post.findFirst({ where: { id: repostOfId, isDeleted: false }, select: { id: true } });
      if (!original) throw new NotFoundException('Referenced post not found');
    }
  }

  private notifyRepost(actorId: string, repostOfId: string, postId: string): void {
    this.prisma.post.findUnique({ where: { id: repostOfId }, select: { authorId: true } })
      .then((original) => original && this.notifications.notifyInteraction({
        actorId, recipientId: original.authorId, type: NotificationType.REPOST, postId,
      }))
      .catch((err) => this.logger.error('Failed to send repost notification', err));
  }
}
