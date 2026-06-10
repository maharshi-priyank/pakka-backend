import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { GoogleDocsService } from './google-docs.service';

@Controller('google-docs')
@UseGuards(JwtAuthGuard)
export class GoogleDocsController {
  constructor(private readonly googleDocs: GoogleDocsService) {}

  @Get('files')
  listFiles(@CurrentUser() user: User, @Query('query') query?: string) {
    return this.googleDocs.listDriveFiles(user.id, query);
  }

  @Get('files/:docId/text')
  fetchDocText(@CurrentUser() user: User, @Param('docId') docId: string) {
    return this.googleDocs.fetchDocAsText(user.id, docId);
  }

  @Post('export/proposal/:id')
  exportProposal(@CurrentUser() user: User, @Param('id') id: string) {
    return this.googleDocs.exportProposal(user.id, id);
  }

  @Post('export/contract/:id')
  exportContract(@CurrentUser() user: User, @Param('id') id: string) {
    return this.googleDocs.exportContract(user.id, id);
  }
}
