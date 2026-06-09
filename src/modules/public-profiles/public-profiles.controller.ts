import { Controller, Get, Patch, Post, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PublicProfilesService } from './public-profiles.service';
import { UpdatePublicProfileDto } from './dto/update-public-profile.dto';
import { SubmitEnquiryDto } from './dto/submit-enquiry.dto';

@ApiTags('public-profiles')
@Controller('public-profiles')
export class PublicProfilesController {
  constructor(private readonly service: PublicProfilesService) {}

  // ── Authenticated ──────────────────────────────────────────────────────────

  @Get('me')
  getMyProfile(@CurrentUser() user: { id: string }) {
    return this.service.getMyProfile(user.id);
  }

  @Patch('me')
  updateMyProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePublicProfileDto,
  ) {
    return this.service.updateMyProfile(user.id, dto);
  }

  @Post('me/recalculate')
  recalculateMyStats(@CurrentUser() user: { id: string }) {
    return this.service.recalculateUserStats(user.id);
  }

  // ── Public (no auth) ───────────────────────────────────────────────────────

  @Public()
  @Get(':username')
  getPublicProfile(@Param('username') username: string) {
    return this.service.getPublicProfile(username);
  }

  @Public()
  @Post(':username/enquire')
  submitEnquiry(
    @Param('username') username: string,
    @Body() dto: SubmitEnquiryDto,
  ) {
    return this.service.submitEnquiry(username, dto);
  }
}
