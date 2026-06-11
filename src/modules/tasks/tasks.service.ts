import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';

export interface CreateTaskDto {
  title:       string;
  dueDate?:    string;
  includeTime?: boolean;
  isPrivate?:  boolean;
  projectId?:  string;
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {
  status?: TaskStatus;
}

export interface ListTasksQuery {
  status?:    TaskStatus;
  projectId?: string;
  search?:    string;
}

const TASK_INCLUDE = {
  project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListTasksQuery) {
    const where: Record<string, unknown> = { userId };
    if (query.status)    where['status']    = query.status;
    if (query.projectId) where['projectId'] = query.projectId;
    if (query.search) {
      where['title'] = { contains: query.search, mode: 'insensitive' };
    }
    return this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: TASK_INCLUDE,
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    return this.prisma.task.create({
      data: {
        userId,
        title:       dto.title,
        dueDate:     dto.dueDate ? new Date(dto.dueDate) : undefined,
        includeTime: dto.includeTime ?? false,
        isPrivate:   dto.isPrivate  ?? false,
        projectId:   dto.projectId,
      },
      include: TASK_INCLUDE,
    });
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    await this.findOne(userId, id);
    return this.prisma.task.update({
      where:  { id },
      data: {
        title:       dto.title,
        status:      dto.status,
        dueDate:     dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : undefined,
        includeTime: dto.includeTime,
        isPrivate:   dto.isPrivate,
        projectId:   dto.projectId !== undefined ? (dto.projectId || null) : undefined,
      },
      include: TASK_INCLUDE,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.task.delete({ where: { id } });
  }
}
