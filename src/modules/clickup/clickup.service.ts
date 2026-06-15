import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';

interface ClickUpList {
  id:      string;
  name:    string;
  content: string | null;
}

interface ClickUpSpace {
  id:    string;
  name:  string;
  lists: ClickUpList[];
}

interface ClickUpTimeEntry {
  id:       string;
  task:     { id: string; name: string } | null;
  duration: string; // ms as string
  start:    string; // unix ms as string
  list:     { id: string } | null;
}

interface ClickUpMember {
  user: {
    id:       number;
    username: string;
    email:    string;
  };
}

export interface SyncResult {
  projects:    number;
  timeEntries: number;
  clients:     number;
}

@Injectable()
export class ClickUpService {
  private readonly logger = new Logger(ClickUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users:  UsersService,
  ) {}

  private async getToken(userId: string): Promise<{ token: string; workspaceId: string }> {
    const stored = await this.users.getClickUpTokens(userId);
    if (!stored?.clickUpAccessToken || !stored?.clickUpWorkspaceId) {
      throw new UnauthorizedException('ClickUp not connected');
    }
    return { token: stored.clickUpAccessToken, workspaceId: stored.clickUpWorkspaceId };
  }

  private async clickupGet<T>(url: string, token: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: token },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ClickUp API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async getWorkspaceMembers(token: string, workspaceId: string): Promise<ClickUpMember[]> {
    // Members are embedded in the GET /team response, not a separate /member endpoint
    const data = await this.clickupGet<{ teams: Array<{ id: string; members: ClickUpMember[] }> }>(
      'https://api.clickup.com/api/v2/team',
      token,
    );
    const team = data.teams.find((t) => t.id === workspaceId);
    return team?.members ?? [];
  }

  async previewLists(userId: string) {
    const { token, workspaceId } = await this.getToken(userId);
    const spaces = await this.clickupGet<{ spaces: ClickUpSpace[] }>(
      `https://api.clickup.com/api/v2/team/${workspaceId}/space?archived=false`,
      token,
    );

    const lists: { id: string; name: string; spaceName: string }[] = [];
    for (const space of spaces.spaces) {
      const listsData = await this.clickupGet<{ lists: ClickUpList[] }>(
        `https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`,
        token,
      );
      for (const list of listsData.lists) {
        lists.push({ id: list.id, name: list.name, spaceName: space.name });
      }
    }

    const members = await this.getWorkspaceMembers(token, workspaceId);

    return {
      lists,
      members: members.map((m) => ({
        id:       String(m.user.id),
        username: m.user.username,
        email:    m.user.email,
      })),
    };
  }

  async syncAll(userId: string): Promise<SyncResult> {
    const { token, workspaceId } = await this.getToken(userId);

    const projectsCount = await this.syncLists(userId, token, workspaceId);

    // Time entries require Business plan — degrade gracefully on free accounts
    let timeCount = 0;
    try {
      timeCount = await this.syncTimeEntries(userId, token, workspaceId);
    } catch (err) {
      this.logger.warn(`Time entries sync skipped (may require Business plan): ${(err as Error).message}`);
    }

    const clientsCount = await this.syncMembers(userId, token, workspaceId);

    return { projects: projectsCount, timeEntries: timeCount, clients: clientsCount };
  }

  private async syncLists(userId: string, token: string, workspaceId: string): Promise<number> {
    const spaces = await this.clickupGet<{ spaces: ClickUpSpace[] }>(
      `https://api.clickup.com/api/v2/team/${workspaceId}/space?archived=false`,
      token,
    );

    let count = 0;
    for (const space of spaces.spaces) {
      const listsData = await this.clickupGet<{ lists: ClickUpList[] }>(
        `https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`,
        token,
      );

      for (const list of listsData.lists) {
        await this.prisma.project.upsert({
          where:  { clickupListId: list.id },
          update: { name: list.name, description: list.content ?? undefined },
          create: {
            workspaceId: userId,
            name:         list.name,
            description:  list.content ?? null,
            clickupListId: list.id,
          },
        });
        count++;
      }
    }

    return count;
  }

  private async syncTimeEntries(userId: string, token: string, workspaceId: string): Promise<number> {
    const data = await this.clickupGet<{ data: ClickUpTimeEntry[] }>(
      `https://api.clickup.com/api/v2/team/${workspaceId}/time_entries`,
      token,
    );

    let count = 0;
    for (const entry of data.data) {
      if (!entry.task || !entry.duration) continue;

      const durationMins = Math.round(parseInt(entry.duration, 10) / 60000);
      if (durationMins <= 0) continue;

      const entryDate = new Date(parseInt(entry.start, 10));

      // Find the matching project via clickupListId
      let projectId: string | undefined;
      if (entry.list?.id) {
        const project = await this.prisma.project.findFirst({
          where:  { clickupListId: entry.list.id, workspaceId: userId },
          select: { id: true },
        });
        projectId = project?.id;
      }

      await this.prisma.timeEntry.upsert({
        where:  { clickupTaskId: entry.task.id },
        update: { durationMins, description: entry.task.name, date: entryDate, projectId },
        create: {
          workspaceId: userId,
          description:  entry.task.name,
          date:         entryDate,
          durationMins,
          projectId,
          clickupTaskId: entry.task.id,
        },
      });
      count++;
    }

    return count;
  }

  private async syncMembers(userId: string, token: string, workspaceId: string): Promise<number> {
    const members = await this.getWorkspaceMembers(token, workspaceId);

    let count = 0;
    for (const member of members) {
      const memberId = String(member.user.id);
      await this.prisma.client.upsert({
        where:  { clickupMemberId: memberId },
        update: { name: member.user.username, email: member.user.email },
        create: {
          workspaceId: userId,
          name:           member.user.username,
          email:          member.user.email,
          clickupMemberId: memberId,
        },
      });
      count++;
    }

    return count;
  }
}
