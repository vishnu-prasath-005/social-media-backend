export interface SearchAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface SearchPostResult {
  id: string;
  content: string;
  type: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  mediaUrls: string[];
  tags: string[];
  isLiked: boolean;
  createdAt: Date;
  rank: number | null;
  author: SearchAuthor;
}

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  bio: string | null;
}

export interface SearchTagResult {
  id: string;
  name: string;
  postCount: number;
}

export interface TrendingTag {
  id: string;
  name: string;
  postCount: number;
  recentCount: number;
}

export interface SearchResponse {
  posts: SearchPostResult[];
  users: SearchUserResult[];
  tags: SearchTagResult[];
}
