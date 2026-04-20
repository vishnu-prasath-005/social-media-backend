export interface LikerUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface LikerResponse {
  userId: string;
  createdAt: Date;
  user: LikerUser;
}

export interface LikersPageResponse {
  data: LikerResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}
