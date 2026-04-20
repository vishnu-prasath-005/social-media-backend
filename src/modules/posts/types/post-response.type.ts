import { PostType } from '@prisma/client';

export interface PostAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface PostResponse {
  id: string;
  content: string;
  type: PostType;
  parentId: string | null;
  repostOfId: string | null;
  mediaUrls: string[];
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  createdAt: Date;
  author: PostAuthor;
  tags: { tag: { name: string } }[];
}

export interface FeedResponse {
  data: PostResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}
