import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LikesService } from './likes.service';

@ApiTags('Likes')
@ApiBearerAuth()
@Controller()
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post('posts/:postId/likes')
  @ApiOperation({ summary: 'Like a post' })
  @ApiResponse({ status: 204, description: 'Post liked.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  likePost(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.likePost(userId, postId);
  }

  @Delete('posts/:postId/likes')
  @ApiOperation({ summary: 'Remove a like from a post' })
  @ApiResponse({ status: 204, description: 'Post unliked.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  unlikePost(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.unlikePost(userId, postId);
  }

  @Post('comments/:commentId/likes')
  @ApiOperation({ summary: 'Like a comment' })
  @ApiResponse({ status: 204, description: 'Comment liked.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  likeComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.likeComment(userId, commentId);
  }

  @Delete('comments/:commentId/likes')
  @ApiOperation({ summary: 'Remove a like from a comment' })
  @ApiResponse({ status: 204, description: 'Comment unliked.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  unlikeComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.unlikeComment(userId, commentId);
  }

  @Public()
  @Get('posts/:postId/likes')
  @ApiOperation({ summary: 'Get users who liked a post' })
  @ApiQuery({ name: 'cursor', required: false, description: 'User UUID from nextCursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getPostLikers(
    @Param('postId') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.likesService.getPostLikers(postId, cursor, limit);
  }
}
