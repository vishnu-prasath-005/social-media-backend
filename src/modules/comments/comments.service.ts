import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  CommentPageResponse,
  CommentResponse,
  CommentTreeNode,
} from './types/comment-response.type';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

// Used for paginated flat lists — includes reply count via _count
const COMMENT_SELECT = {
  id: true,
  postId: true,
  parentId: true,
  content: true,
  likeCount: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
  _count: { select: { replies: { where: { isDeleted: false } } } },
} as const;

// Used when building the in-memory tree — _count is redundant there
const COMMENT_TREE_SELECT = {
  id: true,
  postId: true,
  parentId: true,
  content: true,
  likeCount: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
} as const;

const TREE_HARD_LIMIT = 500;

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    postId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    let parentCommentAuthorId: string | null = null;
    if (dto.parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: dto.parentId, postId, isDeleted: false },
        select: { id: true, authorId: true, parentId: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
      if (parent.parentId) throw new BadRequestException('Replies cannot be nested deeper than 2 levels');
      parentCommentAuthorId = parent.authorId;
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { postId, authorId, content: dto.content, parentId: dto.parentId },
        select: COMMENT_SELECT,
      });
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return created;
    });

    // Notify the post author about the new comment
    this.notifications
      .notifyInteraction({
        actorId: authorId,
        recipientId: post.authorId,
        type: NotificationType.COMMENT,
        postId,
        commentId: comment.id,
      })
      .catch((err) => this.logger.error('Failed to send comment notification', err));

    // If this is a reply to another comment, also notify that comment's author
    // (skip if they're the same person as the post author — already notified above,
    //  or if they're the actor themselves — notifyInteraction drops self-notifications)
    if (parentCommentAuthorId && parentCommentAuthorId !== post.authorId) {
      this.notifications
        .notifyInteraction({
          actorId: authorId,
          recipientId: parentCommentAuthorId,
          type: NotificationType.COMMENT,
          postId,
          commentId: comment.id,
        })
        .catch((err) => this.logger.error('Failed to send reply notification', err));
    }

    return comment as CommentResponse;
  }

  async findByPost(
    postId: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<CommentPageResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const limit = Math.min(Number(rawLimit) || 20, 50);

    const comments = await this.prisma.comment.findMany({
      where: { postId, parentId: null, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: COMMENT_SELECT,
    });

    return this.paginateResult(comments as CommentResponse[], limit);
  }

  async findReplies(
    commentId: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<CommentPageResponse> {
    const parent = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Comment not found');

    const limit = Math.min(Number(rawLimit) || 20, 50);

    const replies = await this.prisma.comment.findMany({
      where: { parentId: commentId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: COMMENT_SELECT,
    });

    return this.paginateResult(replies as CommentResponse[], limit);
  }

  // Single query + in-memory tree — O(n), no N+1.
  // Capped at TREE_HARD_LIMIT; use paginated endpoints for high-volume posts.
  async findTree(postId: string): Promise<CommentTreeNode[]> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const all = await this.prisma.comment.findMany({
      where: { postId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: TREE_HARD_LIMIT,
      select: COMMENT_TREE_SELECT,
    });

    return this.buildTree(all);
  }

  async remove(id: string, authorId: string): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, isDeleted: false },
      select: { authorId: true, postId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== authorId) {
      throw new ForbiddenException('You do not own this comment');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({ where: { id }, data: { isDeleted: true } });
      await tx.post.updateMany({
        where: { id: comment.postId, commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });
    });
  }

  private paginateResult(
    items: CommentResponse[],
    limit: number,
  ): CommentPageResponse {
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
  }

  private buildTree(
    comments: Omit<CommentTreeNode, 'replies'>[],
  ): CommentTreeNode[] {
    const map = new Map<string, CommentTreeNode>();
    const roots: CommentTreeNode[] = [];

    for (const c of comments) {
      map.set(c.id, { ...c, replies: [] });
    }

    for (const node of map.values()) {
      if (node.parentId) {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.replies.push(node);
        } else {
          // Parent was outside the cap window — treat as root
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
