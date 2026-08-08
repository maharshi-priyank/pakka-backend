import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitReviewDto } from './dto/submit-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getByToken(token: string) {
    const review = await this.prisma.review.findUnique({
      where: { token },
      include: {
        project:   { select: { name: true } },
        workspace: { select: { name: true, businessName: true } },
      },
    });
    if (!review) throw new NotFoundException('Review not found');

    return {
      id:            review.id,
      token:         review.token,
      status:        review.status,
      projectName:   review.project.name,
      workspaceName: review.workspace.businessName ?? review.workspace.name,
      rating:        review.rating,
      body:          review.body,
      submittedAt:   review.submittedAt,
    };
  }

  async submit(token: string, dto: SubmitReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { token },
      include: {
        project:   { select: { name: true } },
        workspace: { select: { name: true, businessName: true } },
      },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.status === 'SUBMITTED') {
      throw new ConflictException('Review already submitted');
    }

    return this.prisma.review.update({
      where: { token },
      data: {
        rating:      dto.rating,
        body:        dto.body,
        authorName:  dto.authorName,
        status:      'SUBMITTED',
        submittedAt: new Date(),
      },
    });
  }

  async listForWorkspace(workspaceId: string) {
    return this.prisma.review.findMany({
      where:   { workspaceId, status: 'SUBMITTED' },
      include: { project: { select: { name: true, id: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getWorkspaceStats(workspaceId: string) {
    const result = await this.prisma.review.aggregate({
      where: { workspaceId, status: 'SUBMITTED', rating: { not: null } },
      _avg:   { rating: true },
      _count: { rating: true },
    });
    return {
      averageRating: result._avg.rating,
      totalCount:    result._count.rating,
    };
  }
}
