import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

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
}
