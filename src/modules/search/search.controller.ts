import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Unified search — runs all active types in parallel
  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  // Dedicated endpoints — skip the dispatcher, call the method directly
  @Get('posts')
  searchPosts(@Query() query: SearchQueryDto) {
    return this.searchService.searchPosts(query);
  }

  @Get('users')
  searchUsers(@Query() query: SearchQueryDto) {
    return this.searchService.searchUsers(query);
  }

  @Get('tags')
  searchTags(@Query() query: SearchQueryDto) {
    return this.searchService.searchTags(query);
  }

  @Get('trending')
  trending(@Query('limit') limit?: number) {
    return this.searchService.trending(limit);
  }
}
