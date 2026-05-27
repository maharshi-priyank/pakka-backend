import { Injectable, Logger } from '@nestjs/common';
import { MicrosoftAuthService } from '../microsoft-auth/microsoft-auth.service.js';

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

interface OutlookEventResult {
  meetLink:      string | null;
  outlookEventId: string | null;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

@Injectable()
export class OutlookCalendarService {
  private readonly logger = new Logger(OutlookCalendarService.name);

  constructor(private readonly msAuth: MicrosoftAuthService) {}

  async createEvent(userId: string, meeting: MeetingEvent): Promise<OutlookEventResult> {
    try {
      const token = await this.msAuth.getValidAccessToken(userId);

      const startTime = new Date(meeting.scheduledAt);
      const endTime   = new Date(startTime.getTime() + meeting.durationMins * 60 * 1000);

      const allEmails = [meeting.clientEmail, meeting.leadEmail, ...(meeting.guestEmails ?? [])]
        .filter((e): e is string => !!e)
        .filter((e, i, arr) => arr.indexOf(e) === i);

      const contactLine = meeting.clientEmail
        ? `Client: ${meeting.clientEmail}`
        : meeting.leadEmail
          ? `Lead: ${meeting.leadEmail}`
          : ''
      const bodyText = [meeting.agenda, contactLine].filter(Boolean).join('\n\n')

      const body = {
        subject: meeting.title,
        body: {
          contentType: 'text',
          content:     bodyText,
        },
        start: {
          dateTime: startTime.toISOString().replace('Z', ''),
          timeZone: 'India Standard Time',
        },
        end: {
          dateTime: endTime.toISOString().replace('Z', ''),
          timeZone: 'India Standard Time',
        },
        attendees: allEmails.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        })),
        isOnlineMeeting:            true,
        reminderMinutesBeforeStart: 15,
        isReminderOn:               true,
      };

      const response = await fetch(`${GRAPH_BASE}/me/events`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Graph API createEvent ${response.status}: ${err}`);
        throw new Error(`Graph API error ${response.status}: ${err}`);
      }

      const event  = await response.json() as Record<string, unknown>;
      const joinUrl = (event['onlineMeeting'] as Record<string, string> | null)?.joinUrl ?? null;

      return {
        meetLink:       joinUrl,
        outlookEventId: event['id'] as string ?? null,
      };
    } catch (err) {
      this.logger.warn(`Failed to create Outlook Calendar event: ${(err as Error).message}`);
      return { meetLink: null, outlookEventId: null };
    }
  }

  async updateEvent(
    userId: string,
    outlookEventId: string,
    updates: { title?: string; scheduledAt?: Date; durationMins?: number },
  ): Promise<void> {
    try {
      const token = await this.msAuth.getValidAccessToken(userId);
      const patch: Record<string, unknown> = {};

      if (updates.title) patch['subject'] = updates.title;
      if (updates.scheduledAt) {
        const start = new Date(updates.scheduledAt);
        const end   = new Date(start.getTime() + (updates.durationMins ?? 30) * 60 * 1000);
        patch['start'] = { dateTime: start.toISOString(), timeZone: 'Asia/Calcutta' };
        patch['end']   = { dateTime: end.toISOString(),   timeZone: 'Asia/Calcutta' };
      }

      const response = await fetch(`${GRAPH_BASE}/me/events/${outlookEventId}`, {
        method:  'PATCH',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Graph API error ${response.status}: ${err}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to update Outlook Calendar event: ${(err as Error).message}`);
    }
  }

  async sendEmail(userId: string, opts: { to: string; subject: string; html: string }): Promise<boolean> {
    try {
      const token = await this.msAuth.getValidAccessToken(userId);
      const body  = {
        message: {
          subject: opts.subject,
          body: { contentType: 'HTML', content: opts.html },
          toRecipients: [{ emailAddress: { address: opts.to } }],
        },
        saveToSentItems: true,
      };
      const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`Outlook sendMail failed ${res.status}: ${err}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Outlook sendMail error: ${(err as Error).message}`);
      return false;
    }
  }

  async checkConflicts(userId: string, scheduledAt: Date, durationMins: number): Promise<{ hasConflict: boolean; conflicts: { title: string; start: string; end: string }[] }> {
    try {
      const token    = await this.msAuth.getValidAccessToken(userId);
      const start    = new Date(scheduledAt);
      const end      = new Date(start.getTime() + durationMins * 60 * 1000);

      const url = `${GRAPH_BASE}/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$select=subject,start,end&$top=5`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) return { hasConflict: false, conflicts: [] };

      const data = await res.json() as { value: { subject: string; start: { dateTime: string }; end: { dateTime: string } }[] };
      const conflicts = (data.value ?? []).map(e => ({ title: e.subject, start: e.start.dateTime, end: e.end.dateTime }));
      return { hasConflict: conflicts.length > 0, conflicts };
    } catch {
      return { hasConflict: false, conflicts: [] };
    }
  }

  async deleteEvent(userId: string, outlookEventId: string): Promise<void> {
    try {
      const token = await this.msAuth.getValidAccessToken(userId);
      const response = await fetch(`${GRAPH_BASE}/me/events/${outlookEventId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok && response.status !== 404) {
        const err = await response.text();
        throw new Error(`Graph API error ${response.status}: ${err}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete Outlook Calendar event: ${(err as Error).message}`);
    }
  }
}
