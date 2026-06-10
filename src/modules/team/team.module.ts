import { Module } from '@nestjs/common'
import { TeamService } from './team.service'
import { TeamController } from './team.controller'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  imports:     [AutomationsModule],
  controllers: [TeamController],
  providers:   [TeamService],
})
export class TeamModule {}
