import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Paginated personal notifications for the authenticated user */
  @Get()
  @ApiOperation({ summary: 'Get personal notifications' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyNotifications(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getForUser(userId, cursor, limit);
  }

  /** Unread badge count */
  @Get('unread-count')
  @ApiOperation({ summary: 'Get the unread notification count' })
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  /**
   * Fallback for offline clients — returns new-post broadcast events.
   * Pass ?since=<ISO8601> to fetch only events after a given timestamp.
   */
  @Get('broadcast')
  @ApiOperation({ summary: 'Get new-post broadcast events for offline recovery' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO 8601 timestamp' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getBroadcast(
    @Query('since') since?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getBroadcast(since, limit);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiResponse({ status: 204, description: 'Notification marked as read.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markRead(userId, notificationId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all personal notifications as read' })
  @ApiResponse({ status: 204, description: 'Notifications marked as read.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }
}
