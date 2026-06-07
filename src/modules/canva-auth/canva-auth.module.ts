import { Module } from '@nestjs/common';
import { CanvaAuthService } from './canva-auth.service.js';
import { CanvaAuthController } from './canva-auth.controller.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports:     [UsersModule],
  providers:   [CanvaAuthService],
  controllers: [CanvaAuthController],
  exports:     [CanvaAuthService],
})
export class CanvaAuthModule {}
