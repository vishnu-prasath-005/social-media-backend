import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FollowsService } from './follows.service';

@Controller('users/:userId')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post('follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  follow(@Param('userId') targetId: string, @CurrentUser('sub') userId: string) {
    return this.followsService.follow(userId, targetId);
  }

  @Delete('follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollow(@Param('userId') targetId: string, @CurrentUser('sub') userId: string) {
    return this.followsService.unfollow(userId, targetId);
  }

  @Public()
  @Get('followers')
  getFollowers(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.followsService.getFollowers(userId, cursor, limit);
  }

  @Public()
  @Get('following')
  getFollowing(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.followsService.getFollowing(userId, cursor, limit);
  }
}
