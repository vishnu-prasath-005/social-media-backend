import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Paginated personal notifications for the authenticated user */
  @Get()
  getMyNotifications(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getForUser(userId, cursor, limit);
  }

  /** Unread badge count */
  @Get('unread-count')
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  /**
   * Fallback for offline clients — returns new-post broadcast events.
   * Pass ?since=<ISO8601> to fetch only events after a given timestamp.
   */
  @Get('broadcast')
  getBroadcast(
    @Query('since') since?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getBroadcast(since, limit);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markRead(userId, notificationId);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }
}
