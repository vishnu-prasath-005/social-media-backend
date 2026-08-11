import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('threads')
  @ApiOperation({ summary: 'Create a chat thread or return an existing direct-message thread' })
  createThread(@CurrentUser('sub') userId: string, @Body() dto: CreateThreadDto) {
    return this.chatService.createThread(userId, dto);
  }

  @Get('threads')
  @ApiOperation({ summary: 'Get the authenticated user\'s chat threads' })
  getThreads(@CurrentUser('sub') userId: string) {
    return this.chatService.getThreads(userId);
  }

  @Get('threads/:threadId/messages')
  @ApiOperation({ summary: 'Get cursor-paginated messages in a chat thread' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Message UUID from nextCursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMessages(
    @Param('threadId') threadId: string,
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(threadId, userId, cursor, limit);
  }

  @Patch('threads/:threadId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a chat thread as read (HTTP fallback)' })
  markRead(@Param('threadId') threadId: string, @CurrentUser('sub') userId: string) {
    return this.chatService.markRead(threadId, userId);
  }
}
