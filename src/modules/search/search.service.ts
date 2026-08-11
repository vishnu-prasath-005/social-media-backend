import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchQueryDto, SearchType } from './dto/search-query.dto';
import {
  SearchPostResult,
  SearchResponse,
  SearchTagResult,
  SearchUserResult,
  TrendingTag,
} from './types/search-response.type';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(dto: SearchQueryDto, viewerId?: string): Promise<SearchResponse> {
    const type = dto.type ?? SearchType.ALL;

    const [posts, users, tags] = await Promise.all([
      type === SearchType.POSTS || type === SearchType.ALL
        ? this.searchPosts(dto, viewerId)
        : Promise.resolve<SearchPostResult[]>([]),
      type === SearchType.USERS || type === SearchType.ALL
        ? this.searchUsers(dto)
        : Promise.resolve<SearchUserResult[]>([]),
      type === SearchType.TAGS || type === SearchType.ALL
        ? this.searchTags(dto)
        : Promise.resolve<SearchTagResult[]>([]),
    ]);

    return { posts, users, tags };
  }

  // ─── Dedicated search methods (also used by dedicated controller endpoints) ──

  async searchPosts(dto: SearchQueryDto, viewerId?: string): Promise<SearchPostResult[]> {
    const q = dto.q?.trim() ?? '';
    const limit = dto.limit ?? 20;
    const offset = dto.offset ?? 0;
    const tags = dto.tags?.map((t) => t.toLowerCase()) ?? [];

    if (!q && !tags.length) return [];

    if (q) {
      const tagFilter = tags.length
        ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM post_tags pt
            JOIN tags tg ON tg.id = pt.tag_id
            WHERE pt.post_id = p.id AND tg.name = ANY(${tags}::text[])
          )`
        : Prisma.sql``;

      // CTE computes the tsquery once; GIN index on search_vector hits when present.
      return this.prisma.$queryRaw<SearchPostResult[]>(Prisma.sql`
        WITH tsq AS (SELECT plainto_tsquery('english', ${q}) AS v)
        SELECT
          p.id,
          p.content,
          p.type::text                                                   AS type,
          p.like_count                                                   AS "likeCount",
          p.comment_count                                                AS "commentCount",
          p.repost_count                                                 AS "repostCount",
          p.media_urls                                                   AS "mediaUrls",
          COALESCE(ARRAY(SELECT tg.name FROM post_tags pt JOIN tags tg ON tg.id = pt.tag_id WHERE pt.post_id = p.id), ARRAY[]::text[]) AS tags,
          EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${viewerId ?? ''}) AS "isLiked",
          p.created_at                                                   AS "createdAt",
          ts_rank(to_tsvector('english', p.content), tsq.v)             AS rank,
          json_build_object(
            'id',          u.id,
            'username',    u.username,
            'displayName', u.display_name,
            'avatarUrl',   u.avatar_url,
            'isVerified',  u.is_verified
          )                                                              AS author
        FROM posts p
        CROSS JOIN tsq
        JOIN users u ON u.id = p.author_id
        WHERE p.is_deleted = false
          AND to_tsvector('english', p.content) @@ tsq.v
          ${tagFilter}
        ORDER BY rank DESC, p.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
    }

    // Tag-only path — no FTS, filter by tag association
    return this.prisma.$queryRaw<SearchPostResult[]>(Prisma.sql`
      SELECT
        p.id,
        p.content,
        p.type::text  AS type,
        p.like_count  AS "likeCount",
        p.comment_count AS "commentCount",
        p.repost_count  AS "repostCount",
        p.media_urls    AS "mediaUrls",
        COALESCE(ARRAY(SELECT tg.name FROM post_tags pt JOIN tags tg ON tg.id = pt.tag_id WHERE pt.post_id = p.id), ARRAY[]::text[]) AS tags,
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${viewerId ?? ''}) AS "isLiked",
        p.created_at    AS "createdAt",
        NULL::float     AS rank,
        json_build_object(
          'id',          u.id,
          'username',    u.username,
          'displayName', u.display_name,
          'avatarUrl',   u.avatar_url,
          'isVerified',  u.is_verified
        ) AS author
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.is_deleted = false
        AND EXISTS (
          SELECT 1 FROM post_tags pt
          JOIN tags tg ON tg.id = pt.tag_id
          WHERE pt.post_id = p.id AND tg.name = ANY(${tags}::text[])
        )
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  async searchUsers(dto: SearchQueryDto): Promise<SearchUserResult[]> {
    const q = dto.q?.trim() ?? '';
    if (!q) return [];

    const limit = dto.limit ?? 20;
    const offset = dto.offset ?? 0;

    // Relevance scoring: exact match (3) > prefix match (2) > displayName contains (1).
    // Username prefix ILIKE can use B-tree; displayName contains needs pg_trgm for speed.
    return this.prisma.$queryRaw<SearchUserResult[]>(Prisma.sql`
      SELECT
        id,
        username,
        display_name  AS "displayName",
        avatar_url    AS "avatarUrl",
        is_verified   AS "isVerified",
        bio,
        CASE
          WHEN lower(username) = lower(${q})  THEN 3
          WHEN username ILIKE ${q + '%'}       THEN 2
          ELSE 1
        END AS score
      FROM users
      WHERE is_active = true
        AND (
          username     ILIKE ${q + '%'}
          OR display_name ILIKE ${'%' + q + '%'}
        )
      ORDER BY score DESC, username ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  async searchTags(dto: SearchQueryDto): Promise<SearchTagResult[]> {
    const q = dto.q?.trim() ?? '';
    if (!q) return [];

    const limit = dto.limit ?? 20;
    const offset = dto.offset ?? 0;

    // Unique index on tags.name covers prefix ILIKE.
    return this.prisma.tag.findMany({
      where: {
        name: { startsWith: q, mode: 'insensitive' },
        postCount: { gt: 0 },
      },
      orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
      take: limit,
      skip: offset,
      select: { id: true, name: true, postCount: true },
    }) as Promise<SearchTagResult[]>;
  }

  // Time-weighted trending: most-used tags with a recency bonus from the last 7 days.
  async trending(rawLimit?: number): Promise<TrendingTag[]> {
    const limit = Math.min(Number(rawLimit) || 10, 50);

    return this.prisma.$queryRaw<TrendingTag[]>(Prisma.sql`
      SELECT
        t.id,
        t.name,
        t.post_count AS "postCount",
        COUNT(DISTINCT pt.post_id) FILTER (
          WHERE p.created_at > NOW() - INTERVAL '7 days'
        )::int       AS "recentCount"
      FROM tags t
      LEFT JOIN post_tags pt ON pt.tag_id = t.id
      LEFT JOIN posts p      ON p.id = pt.post_id AND p.is_deleted = false
      GROUP BY t.id, t.name, t.post_count
      HAVING t.post_count > 0
      ORDER BY "recentCount" DESC, t.post_count DESC
      LIMIT ${limit}
    `);
  }
}
