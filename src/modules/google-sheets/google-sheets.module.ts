import { Module } from '@nestjs/common';
import { GoogleSheetsController } from './google-sheets.controller';
import { GoogleSheetsService } from './google-sheets.service';
import { GoogleSheetsListener } from './google-sheets.listener';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleAuthModule } from '../google-auth/google-auth.module';

@Module({
  imports:     [PrismaModule, GoogleAuthModule],
  controllers: [GoogleSheetsController],
  providers:   [GoogleSheetsService, GoogleSheetsListener],
})
export class GoogleSheetsModule {}
