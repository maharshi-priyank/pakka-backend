import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AdminSavedViewDto } from './dto/admin-saved-view.dto';

@Injectable()
export class AdminSavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  list(adminId: string, page?: string) {
    return this.prisma.adminSavedView.findMany({
      where: { adminId, ...(page ? { page } : {}) },
      orderBy: [{ page: 'asc' }, { updatedAt: 'desc' }],
      select: { id: true, page: true, name: true, filters: true, createdAt: true, updatedAt: true },
    });
  }

  create(adminId: string, dto: AdminSavedViewDto) {
    return this.prisma.adminSavedView.create({
      data: { adminId, page: dto.page, name: dto.name.trim(), filters: dto.filters as Prisma.InputJsonValue },
      select: { id: true, page: true, name: true, filters: true, createdAt: true, updatedAt: true },
    });
  }

  async update(adminId: string, id: string, dto: AdminSavedViewDto) {
    await this.assertOwned(adminId, id);
    return this.prisma.adminSavedView.update({
      where: { id },
      data: { page: dto.page, name: dto.name.trim(), filters: dto.filters as Prisma.InputJsonValue },
      select: { id: true, page: true, name: true, filters: true, createdAt: true, updatedAt: true },
    });
  }

  async remove(adminId: string, id: string) {
    await this.assertOwned(adminId, id);
    await this.prisma.adminSavedView.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async assertOwned(adminId: string, id: string) {
    const view = await this.prisma.adminSavedView.findFirst({ where: { id, adminId }, select: { id: true } });
    if (!view) throw new NotFoundException('Saved view not found.');
  }
}
