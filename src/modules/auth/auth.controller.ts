import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshPayload } from '../../common/types/jwt-payload.type';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Open — no JWT required.
   * Returns access token, refresh token, and the created user profile.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Open — no JWT required.
   * Returns access token, refresh token, and the authenticated user profile.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/refresh
   * Requires a valid refresh token in the Authorization header.
   * Rotates the refresh token and returns a fresh pair.
   */
  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: JwtRefreshPayload) {
    return this.authService.refreshTokens(user.sub, user.refreshToken);
  }

  /**
   * POST /auth/logout
   * Requires a valid access token (global JwtAuthGuard).
   * Revokes the given refresh token from the DB.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser('sub') userId: string, @Body() dto: LogoutDto) {
    return this.authService.logout(userId, dto.refreshToken);
  }

  /**
   * GET /auth/me
   * Requires a valid access token.
   * Returns the authenticated user's public profile.
   */
  @Get('me')
  getMe(@CurrentUser('sub') userId: string) {
    return this.authService.getMe(userId);
  }
}
