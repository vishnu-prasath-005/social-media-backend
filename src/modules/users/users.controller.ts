import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeactivateUserDto } from './dto/deactivate-user.dto';
import { UsersService } from './users.service';
import { PostsService } from '../posts/posts.service';
import { PostQueryDto } from '../posts/dto/post-query.dto';
import { Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Users and profiles')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly postsService: PostsService,
  ) {}

  // Static routes must come before parameterized :username to ensure correct matching
  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  getMe(@CurrentUser('sub') userId: string) {
    return this.usersService.findById(userId, userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  update(@CurrentUser('sub') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(userId, dto);
  }

  @Patch('me/deactivate')
  @ApiOperation({ summary: 'Deactivate the authenticated user account' })
  @ApiResponse({ status: 200, description: 'Account deactivated.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('sub') userId: string, @Body() dto: DeactivateUserDto) {
    return this.usersService.deactivate(userId, dto.password);
  }

  @Public()
  @Get(':username/posts')
  @ApiOperation({ summary: 'Get a public cursor-paginated profile timeline' })
  profilePosts(
    @Param('username') username: string,
    @Query() query: PostQueryDto,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.postsService.findByUsername(username, userId ?? null, query);
  }

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Get a public profile by username' })
  findByUsername(@Param('username') username: string, @CurrentUser('sub') userId?: string) {
    return this.usersService.findByUsername(username, userId);
  }
}
