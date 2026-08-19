import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Post,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  LoginSessionsService,
  type CurrentLoginSession,
  type LoginSessionRequest,
} from './login-sessions.service';

type SessionsRequest = LoginSessionRequest & { user: User };

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/sessions')
export class LoginSessionsController {
  constructor(private readonly sessions: LoginSessionsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List devices signed in to the current account' })
  async list(@CurrentUser() user: User, @Request() request: SessionsRequest) {
    this.assertDirectUserRequest(request);
    return {
      sessions: await this.sessions.list(user.id, this.current(request)),
    };
  }

  @Delete('current')
  @ApiOperation({ summary: 'Sign out the current device' })
  revokeCurrent(
    @CurrentUser() user: User,
    @Request() request: SessionsRequest,
  ) {
    this.assertDirectUserRequest(request);
    return this.sessions.revokeCurrent(user.id, this.current(request));
  }

  @Post('revoke-others')
  @ApiOperation({ summary: 'Sign out every device except the current one' })
  revokeOthers(@CurrentUser() user: User, @Request() request: SessionsRequest) {
    this.assertDirectUserRequest(request);
    return this.sessions.revokeOthers(user.id, this.current(request));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Sign out one device' })
  revoke(
    @CurrentUser() user: User,
    @Request() request: SessionsRequest,
    @Param('id') id: string,
  ) {
    this.assertDirectUserRequest(request);
    return this.sessions.revoke(user.id, id);
  }

  private current(request: SessionsRequest): CurrentLoginSession {
    if (!request.loginSession) {
      throw new UnauthorizedException('Login session context is unavailable.');
    }
    return request.loginSession;
  }

  private assertDirectUserRequest(request: SessionsRequest): void {
    // Admin impersonation is useful for support, but it must never grant the
    // ability to inspect or terminate a customer's login sessions.
    if (request.impersonatedBy) {
      throw new ForbiddenException(
        'Login sessions cannot be managed while impersonating.',
      );
    }
  }
}
