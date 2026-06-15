import { Controller, Get, Post, Patch, Body, HttpCode, HttpStatus, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/upsert-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayloadOnly } from '../../common/decorators/jwt-payload-only.decorator';
import type { SupabaseJwtPayload } from '../auth/jwt-payload.strategy';
import { User } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Called by the frontend immediately after Supabase login.
   * Validates the JWT (no DB lookup), then upserts the user record using
   * data from the token payload — no request body required.
   */
  @Post('me')
  @JwtPayloadOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert user on first login' })
  upsert(@Request() req: { user: SupabaseJwtPayload }) {
    const { sub, email, user_metadata } = req.user;
    const name = user_metadata?.name || email;
    return this.usersService.upsert({ id: sub, email, name });
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile + active workspace' })
  async getMe(@CurrentUser() user: User) {
    const data = await this.usersService.getMe(user.id);
    if (!data) return null;
    const {
      razorpayKeySecret,
      googleAccessToken,
      googleRefreshToken,
      outlookAccessToken,
      outlookRefreshToken,
      clickUpAccessToken,
      canvaAccessToken,
      canvaRefreshToken,
      flodeskApiKey,
      activeWorkspace,
      ...safeUser
    } = data;
    // Null country → India (backward compat for all existing users)
    const workspace = activeWorkspace ? {
      ...activeWorkspace,
      razorpayKeySecret: undefined, // never expose secret to frontend
    } : null;
    return { ...safeUser, country: safeUser.country ?? 'IN', activeWorkspace: workspace };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, dto);
  }

  @Post('redeem-promo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a promo code to upgrade plan' })
  redeemPromo(@CurrentUser() user: User, @Body('code') code: string) {
    return this.usersService.redeemPromo(user.id, code);
  }
}
