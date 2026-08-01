import {
  Controller, Get, Post, Delete,
  Body, HttpCode, HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { resolveWorkspaceId } from '../users/resolve-workspace-id'
import { User } from '@prisma/client'
import { WhatsappConnectionService } from './whatsapp-connection.service'
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto'

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappConnectionController {
  constructor(private readonly connectionService: WhatsappConnectionService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status for the workspace' })
  getStatus(@CurrentUser() user: User) {
    return this.connectionService.getStatus(resolveWorkspaceId(user))
  }

  @Post('connect')
  @ApiOperation({ summary: 'Connect WhatsApp via Meta Embedded Signup code' })
  connect(@CurrentUser() user: User, @Body() dto: ConnectWhatsappDto) {
    return this.connectionService.connect(resolveWorkspaceId(user), dto.code)
  }

  @Delete('connect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect WhatsApp and revoke access token' })
  async disconnect(@CurrentUser() user: User) {
    await this.connectionService.disconnect(resolveWorkspaceId(user))
  }
}
