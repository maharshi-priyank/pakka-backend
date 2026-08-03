import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminSupportNotesService } from './admin-support-notes.service';
import {
  AdminSupportNoteQueryDto,
  CreateAdminSupportNoteDto,
} from './dto/admin-support-note.dto';

@ApiTags('admin/support-notes')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/support-notes')
export class AdminSupportNotesController {
  constructor(private readonly notes: AdminSupportNotesService) {}

  @Get()
  @ApiOperation({ summary: 'List append-only support notes for a user or workspace' })
  list(@Query() query: AdminSupportNoteQueryDto) {
    return this.notes.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an append-only support note' })
  create(
    @CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole },
    @Body() dto: CreateAdminSupportNoteDto,
  ) {
    return this.notes.create(admin.id, admin.role, dto);
  }
}
