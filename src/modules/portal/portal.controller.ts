import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';
import { MessagesService } from '../messages/messages.service';

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService:   PortalService,
    private readonly messagesService: MessagesService,
  ) {}

  @Public()
  @Get(':token')
  getPortalData(@Param('token') token: string) {
    return this.portalService.getPortalData(token);
  }

  @Public()
  @Post(':token/invoices/:id/create-order')
  createInvoiceOrder(
    @Param('token') token: string,
    @Param('id')    id:    string,
  ) {
    return this.portalService.createInvoiceOrder(token, id);
  }

  @Public()
  @Get(':token/messages')
  getMessages(@Param('token') token: string) {
    return this.messagesService.getThreadByToken(token);
  }

  @Public()
  @Post(':token/messages')
  sendReply(@Param('token') token: string, @Body() body: { body: string }) {
    if (!body?.body?.trim()) throw new BadRequestException('Message body required');
    return this.messagesService.sendReply(token, body.body);
  }

  @Public()
  @Patch(':token/messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Param('token') token: string) {
    return this.messagesService.markReadByToken(token);
  }
}
