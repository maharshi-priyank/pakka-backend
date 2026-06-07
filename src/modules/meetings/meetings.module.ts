import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { OutlookCalendarService } from './outlook-calendar.service.js';
import { GoogleAuthModule } from '../google-auth/google-auth.module.js';
import { MicrosoftAuthModule } from '../microsoft-auth/microsoft-auth.module.js';

@Module({
  imports:     [GoogleAuthModule, MicrosoftAuthModule],
  controllers: [MeetingsController],
  providers:   [MeetingsService, GoogleCalendarService, OutlookCalendarService],
  exports:     [MeetingsService, GoogleCalendarService, OutlookCalendarService],
})
export class MeetingsModule {}
