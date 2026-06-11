import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { TaskBoardsController } from './task-boards.controller'
import { TaskBoardsService } from './task-boards.service'

@Module({
  imports: [PrismaModule],
  controllers: [TaskBoardsController],
  providers: [TaskBoardsService],
})
export class TaskBoardsModule {}
