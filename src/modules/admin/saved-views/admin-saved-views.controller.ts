import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminSavedViewsService } from './admin-saved-views.service';
import { AdminSavedViewDto } from './dto/admin-saved-view.dto';

@ApiTags('admin/saved-views')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/saved-views')
export class AdminSavedViewsController {
  constructor(private readonly views: AdminSavedViewsService) {}

  @Get()
  @ApiOperation({ summary: 'List personal admin saved views' })
  list(@CurrentAdmin() admin: { id: string }, @Query('page') page?: string) {
    return this.views.list(admin.id, page);
  }

  @Post()
  @ApiOperation({ summary: 'Create a personal admin saved view' })
  create(@CurrentAdmin() admin: { id: string }, @Body() dto: AdminSavedViewDto) {
    return this.views.create(admin.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a personal admin saved view' })
  update(@CurrentAdmin() admin: { id: string }, @Param('id') id: string, @Body() dto: AdminSavedViewDto) {
    return this.views.update(admin.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a personal admin saved view' })
  remove(@CurrentAdmin() admin: { id: string }, @Param('id') id: string) {
    return this.views.remove(admin.id, id);
  }
}
