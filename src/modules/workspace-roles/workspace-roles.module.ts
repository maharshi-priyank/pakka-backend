import { Module } from '@nestjs/common'
import { WorkspaceRolesController } from './workspace-roles.controller'
import { WorkspaceRolesService } from './workspace-roles.service'

@Module({
  controllers: [WorkspaceRolesController],
  providers:   [WorkspaceRolesService],
})
export class WorkspaceRolesModule {}
