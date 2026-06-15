import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MeetingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { OutlookCalendarService } from './outlook-calendar.service.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { UpdateMeetingDto } from './dto/update-meeting.dto.js';

const INCLUDE_FULL = {
  lead:   { select: { id: true, name: true, email: true } },
  client: { select: { id: true, name: true, company: true, email: true } },
} as const;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma:           PrismaService,
    private readonly googleCalendar:   GoogleCalendarService,
    private readonly outlookCalendar:  OutlookCalendarService,
    private readonly eventEmitter:     EventEmitter2,
  ) {}

  async create(workspaceId: string, dto: CreateMeetingDto) {
    const user = await this.prisma.user.findUnique({
      where:  { id: workspaceId },
      select: { googleCalendarConnected: true, outlookConnected: true },
    });

    const meeting = await this.prisma.meeting.create({
      data: {
        workspaceId,
        title:        dto.title,
        agenda:       dto.agenda,
        scheduledAt:  new Date(dto.scheduledAt),
        durationMins: dto.durationMins ?? 30,
        leadId:       dto.leadId,
        clientId:     dto.clientId,
        guestEmails:  dto.guestEmails ?? [],
      },
      include: INCLUDE_FULL,
    });

    const eventPayload = {
      id:           meeting.id,
      title:        meeting.title,
      agenda:       meeting.agenda,
      scheduledAt:  meeting.scheduledAt,
      durationMins: meeting.durationMins,
      clientEmail:  meeting.client?.email,
      leadEmail:    meeting.lead?.email,
      guestEmails:  meeting.guestEmails,
    };

    let meetingUpdate: Record<string, unknown> | null = null;

    const useGoogle  = dto.provider === 'google'  ? user?.googleCalendarConnected  : undefined;
    const useOutlook = dto.provider === 'outlook' ? user?.outlookConnected          : undefined;

    const shouldUseGoogle  = useGoogle  ?? (dto.provider ? false : user?.googleCalendarConnected);
    const shouldUseOutlook = useOutlook ?? (dto.provider ? false : user?.outlookConnected);

    if (shouldUseGoogle) {
      const { meetLink, googleEventId } = await this.googleCalendar.createEvent(workspaceId, eventPayload);
      if (meetLink || googleEventId) {
        meetingUpdate = { meetLink, googleEventId, meetProvider: 'google' };
      }
    } else if (shouldUseOutlook) {
      const { meetLink, outlookEventId } = await this.outlookCalendar.createEvent(workspaceId, eventPayload);
      if (meetLink || outlookEventId) {
        meetingUpdate = { meetLink, outlookEventId, meetProvider: 'outlook' };
      }
    }

    if (meetingUpdate) {
      const updated = await this.prisma.meeting.update({
        where:   { id: meeting.id },
        data:    meetingUpdate,
        include: INCLUDE_FULL,
      });
      this.eventEmitter.emit('meeting.scheduled', { entityId: meeting.id, workspaceId });
      return updated;
    }

    this.eventEmitter.emit('meeting.scheduled', { entityId: meeting.id, workspaceId });
    return meeting;
  }

  async checkConflicts(workspaceId: string, scheduledAt: Date, durationMins: number, provider?: 'google' | 'outlook') {
    const user = await this.prisma.user.findUnique({
      where:  { id: workspaceId },
      select: { googleCalendarConnected: true, outlookConnected: true },
    });

    const useGoogle  = provider === 'google'  ? user?.googleCalendarConnected  : provider ? false : user?.googleCalendarConnected;
    const useOutlook = provider === 'outlook' ? user?.outlookConnected          : provider ? false : user?.outlookConnected;

    if (useGoogle) {
      return this.googleCalendar.checkConflicts(workspaceId, scheduledAt, durationMins);
    }
    if (useOutlook) {
      return this.outlookCalendar.checkConflicts(workspaceId, scheduledAt, durationMins);
    }
    return { hasConflict: false, conflicts: [] };
  }

  async findAll(workspaceId: string, query: { status?: MeetingStatus; page?: number; limit?: number }) {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const skip  = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.meeting.findMany({ where, include: INCLUDE_FULL, orderBy: { scheduledAt: 'asc' }, skip, take: limit }),
      this.prisma.meeting.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findUpcoming(workspaceId: string) {
    return this.prisma.meeting.findMany({
      where:   { workspaceId, scheduledAt: { gte: new Date() }, status: MeetingStatus.SCHEDULED },
      include: INCLUDE_FULL,
      orderBy: { scheduledAt: 'asc' },
      take:    5,
    });
  }

  async getUpcomingCount(workspaceId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const count = await this.prisma.meeting.count({
      where: {
        workspaceId,
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        status:      MeetingStatus.SCHEDULED,
      },
    });
    return { count };
  }

  async findOne(workspaceId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where:   { id, workspaceId },
      include: INCLUDE_FULL,
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async update(workspaceId: string, id: string, dto: UpdateMeetingDto) {
    const meeting = await this.findOne(workspaceId, id);

    const updated = await this.prisma.meeting.update({
      where: { id },
      data:  {
        ...(dto.title        !== undefined ? { title:        dto.title }               : {}),
        ...(dto.agenda       !== undefined ? { agenda:       dto.agenda }              : {}),
        ...(dto.scheduledAt  !== undefined ? { scheduledAt:  new Date(dto.scheduledAt) } : {}),
        ...(dto.durationMins !== undefined ? { durationMins: dto.durationMins }        : {}),
      },
      include: INCLUDE_FULL,
    });

    if (dto.scheduledAt || dto.title) {
      const calUpdate = {
        title:        dto.title,
        scheduledAt:  dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        durationMins: dto.durationMins ?? meeting.durationMins,
      };
      if (meeting.googleEventId) {
        await this.googleCalendar.updateEvent(workspaceId, meeting.googleEventId, calUpdate);
      } else if ((meeting as Record<string, unknown>)['outlookEventId']) {
        await this.outlookCalendar.updateEvent(workspaceId, (meeting as Record<string, unknown>)['outlookEventId'] as string, calUpdate);
      }
    }

    return updated;
  }

  async complete(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    return this.prisma.meeting.update({ where: { id }, data: { status: MeetingStatus.COMPLETED }, include: INCLUDE_FULL });
  }

  async cancel(workspaceId: string, id: string) {
    const meeting = await this.findOne(workspaceId, id) as Record<string, unknown>;
    if (meeting['googleEventId']) {
      await this.googleCalendar.deleteEvent(workspaceId, meeting['googleEventId'] as string);
    } else if (meeting['outlookEventId']) {
      await this.outlookCalendar.deleteEvent(workspaceId, meeting['outlookEventId'] as string);
    }
    return this.prisma.meeting.update({ where: { id }, data: { status: MeetingStatus.CANCELLED }, include: INCLUDE_FULL });
  }
}
