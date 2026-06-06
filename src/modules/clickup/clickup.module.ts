import { Module } from '@nestjs/common';
import { ClickUpController } from './clickup.controller.js';
import { ClickUpService } from './clickup.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports:     [UsersModule],
  controllers: [ClickUpController],
  providers:   [ClickUpService],
})
export class ClickUpModule {}
