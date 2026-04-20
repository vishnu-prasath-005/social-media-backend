import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { CommentsModule } from './modules/comments/comments.module';
import { LikesModule } from './modules/likes/likes.module';
import { FollowsModule } from './modules/follows/follows.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { MediaModule } from './modules/media/media.module';

@Module({
  imports: [
    // Config — loaded globally so all modules can inject ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),

    // Rate limiting — applied globally via APP_GUARD below
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10) * 1000,
            limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
          },
        ],
      }),
    }),

    // Database — global so every module gets PrismaService injected
    PrismaModule,

    // Feature modules
    AuthModule,
    UsersModule,
    PostsModule,
    CommentsModule,
    LikesModule,
    FollowsModule,
    ChatModule,
    NotificationsModule,
    SearchModule,
    MediaModule,
  ],
  providers: [
    // JWT guard is the default — mark endpoints @Public() to bypass
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Rate limit guard — applied after auth so authenticated users get proper limits
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
