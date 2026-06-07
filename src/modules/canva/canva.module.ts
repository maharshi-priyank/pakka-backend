import { Module } from '@nestjs/common';
import { CanvaService } from './canva.service.js';
import { CanvaController } from './canva.controller.js';
import { UsersModule } from '../users/users.module.js';
import { CanvaAuthModule } from '../canva-auth/canva-auth.module.js';

@Module({
  imports:     [UsersModule, CanvaAuthModule],
  providers:   [CanvaService],
  controllers: [CanvaController],
  exports:     [CanvaService],
})
export class CanvaModule {}
