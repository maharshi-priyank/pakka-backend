import { Module } from '@nestjs/common';
import { FlodeskController } from './flodesk.controller.js';
import { FlodeskService } from './flodesk.service.js';
import { FlodeskListener } from './flodesk.listener.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports:     [UsersModule],
  controllers: [FlodeskController],
  providers:   [FlodeskService, FlodeskListener],
  exports:     [FlodeskService],
})
export class FlodeskModule {}
