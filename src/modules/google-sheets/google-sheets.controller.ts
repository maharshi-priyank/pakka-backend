import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { GoogleSheetsService } from './google-sheets.service';

@Controller('google-sheets')
@UseGuards(JwtAuthGuard)
export class GoogleSheetsController {
  constructor(private readonly googleSheets: GoogleSheetsService) {}

  @Post('connect')
  async connect(@CurrentUser() user: User) {
    const sheetId = await this.googleSheets.connect(user.id);
    return { sheetId, url: `https://docs.google.com/spreadsheets/d/${sheetId}` };
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: User) {
    await this.googleSheets.disconnect(user.id);
    return { success: true };
  }

  @Get('sheet-url')
  getSheetUrl(@CurrentUser() user: User) {
    return this.googleSheets.getSheetUrl(user.id);
  }
}
