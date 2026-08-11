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
import { CreatePostDto } from './dto/create-post.dto';
import { PostQueryDto } from './dto/post-query.dto';
import { PostsService } from './posts.service';

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an original post, reply, repost, or quote post' })
  @ApiResponse({ status: 201, description: 'Post created.' })
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePostDto) {
    return this.postsService.create(userId, dto);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Get the following or global post feed' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Post UUID from nextCursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'scope', required: false, enum: ['following', 'global'] })
  @ApiQuery({ name: 'type', required: false, enum: ['ORIGINAL', 'REPLY', 'REPOST', 'QUOTE'] })
  @ApiQuery({ name: 'tags', required: false, type: [String] })
  feed(@CurrentUser('sub') userId: string, @Query() query: PostQueryDto) {
    return this.postsService.findFeed(userId, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get one public post' })
  findOne(@Param('id') id: string, @CurrentUser('sub') userId?: string) {
    return this.postsService.findOne(id, userId ?? null);
  }

  @Public()
  @Get(':id/replies')
  @ApiOperation({ summary: 'Get post replies' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findReplies(@Param('id') id: string, @Query() query: PostQueryDto, @CurrentUser('sub') userId?: string) {
    return this.postsService.findReplies(id, userId ?? null, query);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete the authenticated user\'s post' })
  @ApiResponse({ status: 204, description: 'Post deleted.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.postsService.remove(id, userId);
  }
}
