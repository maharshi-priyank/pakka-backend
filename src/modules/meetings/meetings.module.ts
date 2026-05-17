import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleAuthModule } from '../google-auth/google-auth.module';

@Module({
  imports:     [GoogleAuthModule],
  controllers: [MeetingsController],
  providers:   [MeetingsService, GoogleCalendarService],
  exports:     [MeetingsService],
})
export class MeetingsModule {}
