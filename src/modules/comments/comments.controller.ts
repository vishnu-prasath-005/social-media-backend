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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'Add a comment or comment reply to a post' })
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
  @ApiOperation({ summary: 'Get the full comment tree for a post' })
  findTree(@Param('postId') postId: string) {
    return this.commentsService.findTree(postId);
  }

  @Public()
  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'Get paginated top-level comments for a post' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByPost(
    @Param('postId') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.commentsService.findByPost(postId, cursor, limit);
  }

  @Public()
  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'Get paginated replies to a comment' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findReplies(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.commentsService.findReplies(id, cursor, limit);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete the authenticated user\'s comment' })
  @ApiResponse({ status: 204, description: 'Comment deleted.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.commentsService.remove(id, userId);
  }
}
