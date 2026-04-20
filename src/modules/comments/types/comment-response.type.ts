export interface CommentAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface CommentResponse {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  likeCount: number;
  createdAt: Date;
  author: CommentAuthor;
  _count: { replies: number };
}

export interface CommentTreeNode {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  likeCount: number;
  createdAt: Date;
  author: CommentAuthor;
  replies: CommentTreeNode[];
}

export interface CommentPageResponse {
  data: CommentResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}
