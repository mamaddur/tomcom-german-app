import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

/** Announcements now (FR-205); push reminders and batch messages follow (FR-803, FR-906). */
@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class NotificationsModule {}
