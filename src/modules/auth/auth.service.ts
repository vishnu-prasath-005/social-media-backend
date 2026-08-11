import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponse, AuthTokens, AuthUser } from './types/auth-response.type';
import { MailService } from '../mail/mail.service';

const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

interface PasswordResetOtpRow {
  id: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
}

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
    private readonly mail: MailService,
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

    if (!user || !passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // A previously deactivated account is restored when its owner proves
    // ownership by signing in with the correct password.
    if (!user.isActive) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isActive: true },
      });
    }

    const { passwordHash: _, isActive: __, ...safeUser } = user;
    const tokens = await this.issueAndPersistTokens(user.id, user.username);
    return { user: safeUser as AuthUser, ...tokens };
  }

  async requestPasswordReset(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, isActive: true },
    });

    // Always return success so this endpoint cannot reveal whether an email exists.
    if (!user || !user.isActive) return;

    const otp = crypto.randomInt(100000, 1000000).toString();
    await this.deletePasswordResetOtps(user.id);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO password_reset_otps (id, user_id, code_hash, expires_at)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${this.hashOtp(otp)}, ${new Date(Date.now() + OTP_EXPIRY_MS)})
    `);

    try {
      await this.mail.sendPasswordResetOtp(user.email, otp);
    } catch (error) {
      await this.deletePasswordResetOtps(user.id);
      throw error;
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired password reset code');
    }

    const resets = await this.prisma.$queryRaw<PasswordResetOtpRow[]>(Prisma.sql`
      SELECT id, code_hash AS "codeHash", expires_at AS "expiresAt", attempts
      FROM password_reset_otps
      WHERE user_id = ${user.id} AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const reset = resets[0];
    if (!reset || reset.expiresAt < new Date() || reset.attempts >= MAX_OTP_ATTEMPTS) {
      throw new UnauthorizedException('Invalid or expired password reset code');
    }

    if (this.hashOtp(dto.otp) !== reset.codeHash) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = ${reset.id}
      `);
      throw new UnauthorizedException('Invalid or expired password reset code');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE password_reset_otps SET used_at = ${new Date()} WHERE id = ${reset.id}
      `),
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
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

  async getAccountInformation(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        bannerUrl: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...user, accountStatus: user.isActive ? 'active' : 'deactivated' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new ConflictException('New password must be different from current password');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
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

  private hashOtp(otp: string): string {
    const secret = this.config.getOrThrow<string>('jwt.accessSecret');
    return crypto.createHmac('sha256', secret).update(otp).digest('hex');
  }

  private deletePasswordResetOtps(userId: string): Promise<number> {
    return this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM password_reset_otps WHERE user_id = ${userId}`,
    );
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
