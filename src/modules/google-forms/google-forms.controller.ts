import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { GoogleFormsService } from './google-forms.service';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { User } from '@prisma/client';

@Controller('google-forms')
@UseGuards(JwtAuthGuard)
export class GoogleFormsController {
  constructor(private readonly googleForms: GoogleFormsService) {}

  @Post('connect')
  connect(@CurrentUser() user: User) {
    return this.googleForms.connect(user.id);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() user: User) {
    return this.googleForms.disconnect(user.id);
  }

  @Get('setup')
  getSetupInfo(@CurrentUser() user: User) {
    return this.googleForms.getSetupInfo(user.id);
  }

  @Public()
  @Post('webhook/:token')
  handleWebhook(
    @Param('token') token: string,
    @Body() dto: WebhookPayloadDto,
  ) {
    return this.googleForms.handleWebhook(token, dto);
  }
}
