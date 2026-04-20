import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('posts/:postId/comments')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('postId') postId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(postId, userId, dto);
  }

  // Full comment tree — single query, in-memory assembly. Use for low-to-medium volume.
  @Public()
  @Get('posts/:postId/comments/tree')
  findTree(@Param('postId') postId: string) {
    return this.commentsService.findTree(postId);
  }

  @Public()
  @Get('posts/:postId/comments')
  findByPost(
    @Param('postId') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.commentsService.findByPost(postId, cursor, limit);
  }

  @Public()
  @Get('comments/:id/replies')
  findReplies(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.commentsService.findReplies(id, cursor, limit);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.commentsService.remove(id, userId);
  }
}
