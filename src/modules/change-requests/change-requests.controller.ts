import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { ChangeRequestsService } from './change-requests.service';
import { RespondChangeRequestDto } from './dto/respond-change-request.dto';

@Controller()
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Get('projects/:projectId/change-requests')
  listForProject(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    return this.changeRequestsService.listForProject(resolveWorkspaceId(user), projectId);
  }

  @Get('change-requests/:id')
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.changeRequestsService.findOne(resolveWorkspaceId(user), id);
  }

  @Delete('change-requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.changeRequestsService.delete(resolveWorkspaceId(user), id);
  }

  @Post('change-requests/:id/respond')
  respond(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RespondChangeRequestDto,
  ) {
    return this.changeRequestsService.respond(resolveWorkspaceId(user), id, dto);
  }

  @Post('projects/:projectId/change-requests/:id/respond')
  respondScoped(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RespondChangeRequestDto,
  ) {
    return this.changeRequestsService.respond(resolveWorkspaceId(user), id, dto);
  }
}
