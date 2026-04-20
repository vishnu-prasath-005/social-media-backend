export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}
