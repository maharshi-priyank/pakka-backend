import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../meetings/google-calendar.service';
import { OutlookCalendarService } from '../meetings/outlook-calendar.service';

export interface CalendarEvent {
  id:           string;
  type:         'meeting' | 'project_deadline' | 'google_external' | 'outlook_external';
  title:        string;
  start:        string;
  end:          string;
  allDay:       boolean;
  clientName?:  string;
  projectName?: string;
  meetLink?:    string;
  agenda?:      string;
  source:       'clearwork' | 'google' | 'outlook';
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly google:   GoogleCalendarService,
    private readonly outlook:  OutlookCalendarService,
  ) {}

  async getEvents(workspaceId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];

    // 1. ClearWork meetings
    const meetings = await this.prisma.meeting.findMany({
      where: {
        workspaceId,
        scheduledAt: { gte: from, lte: to },
      },
      include: { client: { select: { name: true } } },
    });

    const googleEventIds  = new Set<string>();
    const outlookEventIds = new Set<string>();

    for (const m of meetings) {
      if (m.googleEventId)  googleEventIds.add(m.googleEventId);
      if (m.outlookEventId) outlookEventIds.add(m.outlookEventId);
      const durationMins = m.durationMins ?? 30;
      const end = new Date(m.scheduledAt.getTime() + durationMins * 60 * 1000);
      events.push({
        id:         `meeting_${m.id}`,
        type:       'meeting',
        title:      m.title,
        start:      m.scheduledAt.toISOString(),
        end:        end.toISOString(),
        allDay:     false,
        clientName: m.client?.name ?? undefined,
        meetLink:   m.meetLink   ?? undefined,
        agenda:     m.agenda     ?? undefined,
        source:     'clearwork',
      });
    }

    // 2. Project deadlines (endDate in range)
    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId,
        endDate: { gte: from, lte: to },
      },
      include: { client: { select: { name: true } } },
    });

    for (const p of projects) {
      if (!p.endDate) continue;
      events.push({
        id:          `project_${p.id}`,
        type:        'project_deadline',
        title:       `${p.name} — Deadline`,
        start:       p.endDate.toISOString(),
        end:         p.endDate.toISOString(),
        allDay:      true,
        clientName:  p.client?.name ?? undefined,
        projectName: p.name,
        source:      'clearwork',
      });
    }

    // 3. Google external events (if connected)
    const user = await this.prisma.user.findUnique({
      where:  { id: workspaceId },
      select: { googleCalendarConnected: true, outlookConnected: true },
    });

    if (user?.googleCalendarConnected) {
      try {
        const googleEvents = await this.google.listEvents(workspaceId, from, to);
        for (const e of googleEvents) {
          if (googleEventIds.has(e.id)) continue;
          events.push({
            id:       `google_${e.id}`,
            type:     'google_external',
            title:    e.title,
            start:    e.start,
            end:      e.end,
            allDay:   false,
            meetLink: e.meetLink ?? undefined,
            source:   'google',
          });
        }
      } catch (err) {
        this.logger.warn(`Google calendar fetch failed for user ${workspaceId}: ${(err as Error).message}`);
      }
    }

    // 4. Outlook external events (if connected)
    if (user?.outlookConnected) {
      try {
        const outlookEvents = await this.outlook.listEvents(workspaceId, from, to);
        for (const e of outlookEvents) {
          if (outlookEventIds.has(e.id)) continue;
          events.push({
            id:       `outlook_${e.id}`,
            type:     'outlook_external',
            title:    e.title,
            start:    e.start,
            end:      e.end,
            allDay:   false,
            meetLink: e.meetLink ?? undefined,
            source:   'outlook',
          });
        }
      } catch (err) {
        this.logger.warn(`Outlook calendar fetch failed for user ${workspaceId}: ${(err as Error).message}`);
      }
    }

    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
}
