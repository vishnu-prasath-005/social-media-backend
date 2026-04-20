import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateThreadDto } from './dto/create-thread.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('threads')
  createThread(@CurrentUser('sub') userId: string, @Body() dto: CreateThreadDto) {
    return this.chatService.createThread(userId, dto);
  }

  @Get('threads')
  getThreads(@CurrentUser('sub') userId: string) {
    return this.chatService.getThreads(userId);
  }

  @Get('threads/:threadId/messages')
  getMessages(
    @Param('threadId') threadId: string,
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(threadId, userId, cursor, limit);
  }
}
