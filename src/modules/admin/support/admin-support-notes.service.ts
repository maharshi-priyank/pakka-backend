import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AdminSupportNoteQueryDto,
  CreateAdminSupportNoteDto,
  SupportNoteTargetType,
} from './dto/admin-support-note.dto';

@Injectable()
export class AdminSupportNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminSupportNoteQueryDto) {
    const targetType = this.normalizeTargetType(query.targetType);
    const targetId = query.targetId?.trim();
    if (!targetId) throw new BadRequestException('targetId is required.');
    await this.assertTargetExists(targetType, targetId);

    const notes = await this.prisma.adminSupportNote.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.withAuthors(notes);
  }

  async create(adminId: string, adminRole: AdminRole, dto: CreateAdminSupportNoteDto) {
    const targetType = this.normalizeTargetType(dto.targetType);
    const targetId = dto.targetId.trim();
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Note body cannot be empty.');
    await this.assertTargetExists(targetType, targetId);

    const note = await this.prisma.adminSupportNote.create({
      data: { adminId, targetType, targetId, body },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType,
      targetId,
      action: 'admin.support_note.create',
      after: { noteId: note.id },
    });
    return (await this.withAuthors([note]))[0];
  }

  private async assertTargetExists(targetType: SupportNoteTargetType, targetId: string) {
    const exists = targetType === 'user'
      ? await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
      : await this.prisma.workspace.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`${targetType} not found`);
  }

  private async withAuthors<T extends { adminId: string }>(notes: T[]) {
    const adminIds = [...new Set(notes.map((note) => note.adminId))];
    const admins = adminIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const authors = new Map(admins.map((admin) => [admin.id, admin]));
    return notes.map((note) => ({
      ...note,
      author: authors.get(note.adminId) ?? { id: note.adminId, name: null, email: 'Unknown admin', role: null },
    }));
  }

  private normalizeTargetType(value: string): SupportNoteTargetType {
    if (value === 'user' || value === 'workspace') return value;
    throw new BadRequestException('targetType must be user or workspace.');
  }
}
