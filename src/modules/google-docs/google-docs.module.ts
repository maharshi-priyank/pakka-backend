import { Module } from '@nestjs/common';
import { GoogleDocsController } from './google-docs.controller';
import { GoogleDocsService } from './google-docs.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleAuthModule } from '../google-auth/google-auth.module';

@Module({
  imports:     [PrismaModule, GoogleAuthModule],
  controllers: [GoogleDocsController],
  providers:   [GoogleDocsService],
})
export class GoogleDocsModule {}
