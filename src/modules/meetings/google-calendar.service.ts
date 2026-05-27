import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleAuthService } from '../google-auth/google-auth.service';

interface MeetingEvent {
  id:           string;
  title:        string;
  agenda?:      string | null;
  scheduledAt:  Date;
  durationMins: number;
  clientEmail?: string | null;
  leadEmail?:   string | null;
  guestEmails?: string[];
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  async createEvent(userId: string, meeting: MeetingEvent): Promise<{ meetLink: string | null; googleEventId: string | null }> {
    try {
      const auth     = await this.googleAuth.getAuthorizedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const startTime = new Date(meeting.scheduledAt);
      const endTime   = new Date(startTime.getTime() + meeting.durationMins * 60 * 1000);

      const allEmails = [meeting.clientEmail, meeting.leadEmail, ...(meeting.guestEmails ?? [])]
        .filter((e): e is string => !!e)
        .filter((e, i, arr) => arr.indexOf(e) === i);
      const attendees = allEmails.map(email => ({ email }));

      const contactLine = meeting.clientEmail
        ? `Client: ${meeting.clientEmail}`
        : meeting.leadEmail
          ? `Lead: ${meeting.leadEmail}`
          : ''
      const description = [meeting.agenda, contactLine].filter(Boolean).join('\n\n')

      const response = await calendar.events.insert({
        calendarId:            'primary',
        conferenceDataVersion: 1,
        requestBody: {
          summary:     meeting.title,
          description: description || undefined,
          start:       { dateTime: startTime.toISOString(), timeZone: 'Asia/Kolkata' },
          end:         { dateTime: endTime.toISOString(),   timeZone: 'Asia/Kolkata' },
          attendees,
          conferenceData: {
            createRequest: { requestId: meeting.id, conferenceSolutionKey: { type: 'hangoutsMeet' } },
          },
          reminders: {
            useDefault: false,
            overrides:  [{ method: 'email', minutes: 30 }, { method: 'popup', minutes: 10 }],
          },
        },
      });

      const event    = response.data;
      const meetLink = event.hangoutLink ?? event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri ?? null;

      return { meetLink, googleEventId: event.id ?? null };
    } catch (err) {
      this.logger.warn(`Failed to create Google Calendar event: ${(err as Error).message}`);
      return { meetLink: null, googleEventId: null };
    }
  }

  async updateEvent(userId: string, googleEventId: string, updates: { title?: string; scheduledAt?: Date; durationMins?: number }): Promise<void> {
    try {
      const auth     = await this.googleAuth.getAuthorizedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const patch: Record<string, unknown> = {};
      if (updates.title) patch['summary'] = updates.title;
      if (updates.scheduledAt) {
        const start = new Date(updates.scheduledAt);
        const end   = new Date(start.getTime() + (updates.durationMins ?? 30) * 60 * 1000);
        patch['start'] = { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' };
        patch['end']   = { dateTime: end.toISOString(),   timeZone: 'Asia/Kolkata' };
      }

      await calendar.events.patch({ calendarId: 'primary', eventId: googleEventId, requestBody: patch });
    } catch (err) {
      this.logger.warn(`Failed to update Google Calendar event: ${(err as Error).message}`);
    }
  }

  async checkConflicts(userId: string, scheduledAt: Date, durationMins: number): Promise<{ hasConflict: boolean; conflicts: { title: string; start: string; end: string }[] }> {
    try {
      const auth     = await this.googleAuth.getAuthorizedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const start = new Date(scheduledAt);
      const end   = new Date(start.getTime() + durationMins * 60 * 1000);

      const res = await calendar.events.list({
        calendarId:   'primary',
        timeMin:      start.toISOString(),
        timeMax:      end.toISOString(),
        singleEvents: true,
        maxResults:   5,
        fields:       'items(summary,start,end)',
      });

      const conflicts = (res.data.items ?? []).map(e => ({
        title: e.summary ?? 'Untitled',
        start: e.start?.dateTime ?? e.start?.date ?? '',
        end:   e.end?.dateTime   ?? e.end?.date   ?? '',
      }));

      return { hasConflict: conflicts.length > 0, conflicts };
    } catch {
      return { hasConflict: false, conflicts: [] };
    }
  }

  async deleteEvent(userId: string, googleEventId: string): Promise<void> {
    try {
      const auth     = await this.googleAuth.getAuthorizedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
    } catch (err) {
      this.logger.warn(`Failed to delete Google Calendar event: ${(err as Error).message}`);
    }
  }
}
