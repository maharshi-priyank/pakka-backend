import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { User } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/submit-review.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get('token/:token')
  getByToken(@Param('token') token: string) {
    return this.reviewsService.getByToken(token);
  }

  @Public()
  @Post('token/:token/submit')
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.reviewsService.submit(token, dto);
  }

  @Get('workspace')
  listForWorkspace(@CurrentUser() user: User) {
    return this.reviewsService.listForWorkspace(resolveWorkspaceId(user));
  }

  @Get('workspace/stats')
  getStats(@CurrentUser() user: User) {
    return this.reviewsService.getWorkspaceStats(resolveWorkspaceId(user));
  }
}
