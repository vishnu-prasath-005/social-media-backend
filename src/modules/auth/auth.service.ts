import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse, AuthTokens, AuthUser } from './types/auth-response.type';

const BCRYPT_ROUNDS = 12;

// Fields returned to the client — never includes passwordHash
const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Public Methods ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const username = dto.username.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username }] },
      select: { email: true, username: true },
    });

    if (existing) {
      const field = existing.email === dto.email ? 'Email' : 'Username';
      throw new ConflictException(`${field} is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: { email: dto.email, username, displayName: dto.displayName, passwordHash },
      select: USER_SELECT,
    });

    const tokens = await this.issueAndPersistTokens(user.id, user.username);
    return { user, ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...USER_SELECT, passwordHash: true, isActive: true },
    });

    // Always run bcrypt even when user is not found — prevents timing-based
    // user enumeration by making all rejection paths take equal time.
    const DUMMY_HASH = '$2b$12$KIXnHKonRyIy5IFKP7cQNu5ol5CK5y3QrZO6h1B1UG3qGaS5TeLiO';
    const passwordMatch = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !user.isActive || !passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { passwordHash: _, isActive: __, ...safeUser } = user;
    const tokens = await this.issueAndPersistTokens(user.id, user.username);
    return { user: safeUser as AuthUser, ...tokens };
  }

  async refreshTokens(userId: string, rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.sha256(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true },
    });

    if (!stored || stored.userId !== userId) {
      throw new ForbiddenException('Refresh token is invalid or has been revoked');
    }

    if (stored.expiresAt < new Date()) {
      // Expired token found in DB — clean it up before rejecting
      await this.prisma.refreshToken.delete({ where: { tokenHash } });
      throw new ForbiddenException('Refresh token has expired, please log in again');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('User account is deactivated');
    }

    // Rotate: revoke the old token and issue a fresh pair
    await this.prisma.refreshToken.delete({ where: { tokenHash } });
    return this.issueAndPersistTokens(user.id, user.username);
  }

  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    const tokenHash = this.sha256(rawRefreshToken);
    // deleteMany is intentionally idempotent — no error if already revoked
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash, userId } });
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async issueAndPersistTokens(userId: string, username: string): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, username };

    const accessSecret = this.config.getOrThrow<string>('jwt.accessSecret');
    const refreshSecret = this.config.getOrThrow<string>('jwt.refreshSecret');
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: accessExpiresIn }),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpiresIn }),
    ]);

    const tokenHash = this.sha256(refreshToken);
    const expiresAt = this.parseDuration(refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    // Fire-and-forget: prune expired tokens for this user to prevent table bloat
    this.prisma.refreshToken
      .deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
      .catch(() => {/* non-critical, do not propagate */});

    return { accessToken, refreshToken };
  }

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private parseDuration(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Cannot parse token duration: "${duration}"`);

    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const msMap: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return new Date(Date.now() + amount * msMap[unit]);
  }
}
