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
import { CreatePostDto } from './dto/create-post.dto';
import { PostQueryDto } from './dto/post-query.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePostDto) {
    return this.postsService.create(userId, dto);
  }

  @Get('feed')
  feed(@CurrentUser('sub') userId: string, @Query() query: PostQueryDto) {
    return this.postsService.findFeed(userId, query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('sub') userId?: string) {
    return this.postsService.findOne(id, userId ?? null);
  }

  @Public()
  @Get(':id/replies')
  findReplies(@Param('id') id: string, @Query() query: PostQueryDto, @CurrentUser('sub') userId?: string) {
    return this.postsService.findReplies(id, userId ?? null, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.postsService.remove(id, userId);
  }
}
