import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FollowsService } from './follows.service';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Follows')
@ApiBearerAuth()
@Controller('users/:userId')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post('follow')
  @ApiOperation({ summary: 'Follow a user' })
  @ApiResponse({ status: 200, description: 'Updated relationship information.' })
  @HttpCode(HttpStatus.OK)
  follow(@Param('userId') targetId: string, @CurrentUser('sub') userId: string) {
    return this.followsService.follow(userId, targetId);
  }

  @Delete('follow')
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiResponse({ status: 200, description: 'Updated relationship information.' })
  @HttpCode(HttpStatus.OK)
  unfollow(@Param('userId') targetId: string, @CurrentUser('sub') userId: string) {
    return this.followsService.unfollow(userId, targetId);
  }

  @Public()
  @Get('followers')
  @ApiOperation({ summary: 'Get a user\'s followers' })
  @ApiQuery({ name: 'cursor', required: false, description: 'ISO timestamp from nextCursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getFollowers(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.followsService.getFollowers(userId, cursor, limit);
  }

  @Public()
  @Get('following')
  @ApiOperation({ summary: 'Get accounts followed by a user' })
  @ApiQuery({ name: 'cursor', required: false, description: 'ISO timestamp from nextCursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getFollowing(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.followsService.getFollowing(userId, cursor, limit);
  }
}
