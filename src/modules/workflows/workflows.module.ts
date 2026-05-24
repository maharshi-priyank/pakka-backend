import { Module } from '@nestjs/common'
import { WorkflowsController } from './workflows.controller'
import { WorkflowsService } from './workflows.service'
import { WorkflowEngine } from './workflow.engine'
import { WorkflowScheduler } from './workflow.scheduler'
import { PrismaModule } from '../../prisma/prisma.module'
import { AutomationsModule } from '../automations/automations.module'
import { ContractsModule } from '../contracts/contracts.module'
import { InvoicesModule } from '../invoices/invoices.module'

@Module({
  imports:     [PrismaModule, AutomationsModule, ContractsModule, InvoicesModule],
  controllers: [WorkflowsController],
  providers:   [WorkflowsService, WorkflowEngine, WorkflowScheduler],
  exports:     [WorkflowsService, WorkflowEngine],
})
export class WorkflowsModule {}
