import { Module } from '@nestjs/common';
import { ClickUpAuthController } from './clickup-auth.controller.js';
import { ClickUpAuthService } from './clickup-auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports:     [UsersModule],
  controllers: [ClickUpAuthController],
  providers:   [ClickUpAuthService],
  exports:     [ClickUpAuthService],
})
export class ClickUpAuthModule {}
