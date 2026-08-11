import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

@Public()
@ApiTags('Explore and search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Unified search — runs all active types in parallel
  @Get()
  @ApiOperation({ summary: 'Search posts, users, and tags' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'posts', 'users', 'tags'] })
  @ApiQuery({ name: 'tags', required: false, type: [String] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  search(@Query() query: SearchQueryDto, @CurrentUser('sub') userId?: string) {
    return this.searchService.search(query, userId);
  }

  // Dedicated endpoints — skip the dispatcher, call the method directly
  @Get('posts')
  @ApiOperation({ summary: 'Search posts only' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'tags', required: false, type: [String] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  searchPosts(@Query() query: SearchQueryDto, @CurrentUser('sub') userId?: string) {
    return this.searchService.searchPosts(query, userId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Search users only' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  searchUsers(@Query() query: SearchQueryDto) {
    return this.searchService.searchUsers(query);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Search tags only' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  searchTags(@Query() query: SearchQueryDto) {
    return this.searchService.searchTags(query);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending tags' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  trending(@Query('limit') limit?: number) {
    return this.searchService.trending(limit);
  }
}
