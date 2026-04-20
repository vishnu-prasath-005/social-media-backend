import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { LikesService } from './likes.service';

@Controller()
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post('posts/:postId/likes')
  @HttpCode(HttpStatus.NO_CONTENT)
  likePost(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.likePost(userId, postId);
  }

  @Delete('posts/:postId/likes')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlikePost(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.unlikePost(userId, postId);
  }

  @Post('comments/:commentId/likes')
  @HttpCode(HttpStatus.NO_CONTENT)
  likeComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.likeComment(userId, commentId);
  }

  @Delete('comments/:commentId/likes')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlikeComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.likesService.unlikeComment(userId, commentId);
  }

  @Public()
  @Get('posts/:postId/likes')
  getPostLikers(
    @Param('postId') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.likesService.getPostLikers(postId, cursor, limit);
  }
}
