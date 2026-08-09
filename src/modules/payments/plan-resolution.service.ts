import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayProvider } from './razorpay.provider';

export type PlanTier = 'PRO' | 'STUDIO' | 'SOLO';

export interface ResolvedPlan {
  planId: string;
  price: number;
  window: 'founding' | 'earlyaccess' | 'regular';
  windowEnds?: Date;
}

export interface PublicPlanPrice {
  // Plan IDs are provisioned lazily when checkout starts. The catalogue must
  // remain available when the Razorpay API is unavailable or misconfigured.
  planId: string | null;
  price: number;
}

const PRICES: Record<PlanTier, Record<string, number>> = {
  PRO:    { founding: 149, earlyaccess: 149, regular: 149 },
  SOLO:   { founding: 149, earlyaccess: 149, regular: 149 },
  STUDIO: { founding: 650, earlyaccess: 650, regular: 650 },
};

@Injectable()
export class PlanResolutionService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly razorpay: RazorpayProvider,
  ) {}

  private async resolvePricingWindow(now: Date): Promise<{
    window: 'founding' | 'earlyaccess' | 'regular';
    windowEnds?: Date;
  }> {
    const config = await this.prisma.billingConfig.findUnique({ where: { id: 'singleton' } });

    if (config && now <= config.foundingPeriodEnds) {
      return { window: 'founding', windowEnds: config.foundingPeriodEnds };
    }

    if (config && now <= config.earlyAccessPeriodEnds) {
      return { window: 'earlyaccess', windowEnds: config.earlyAccessPeriodEnds };
    }

    return { window: 'regular' };
  }

  async resolve(tier: PlanTier, now: Date = new Date()): Promise<ResolvedPlan> {
    const { window, windowEnds } = await this.resolvePricingWindow(now);

    const price  = PRICES[tier][window];
    const providerTier = tier === 'PRO' || tier === 'SOLO' ? 'SOLO' : 'STUDIO';
    const planId = await this.razorpay.getOrCreatePlanId(providerTier, 'regular', price);

    return { planId, price, window, windowEnds };
  }

  async currentPricing(): Promise<{
    window: 'founding' | 'earlyaccess' | 'regular';
    windowEnds?: Date;
    pro: PublicPlanPrice;
    solo: PublicPlanPrice;
    studio: PublicPlanPrice;
  }> {
    const { window, windowEnds } = await this.resolvePricingWindow(new Date());
    const proPrice = PRICES.PRO[window];
    const studioPrice = PRICES.STUDIO[window];

    return {
      window,
      windowEnds,
      // This endpoint is a read-only catalogue. Calling Razorpay here made
      // every pricing page fail with 500 when provider credentials expired.
      pro:    { planId: null, price: proPrice },
      // Kept for older clients during the catalogue transition.
      solo:   { planId: null, price: proPrice },
      studio: { planId: null, price: studioPrice },
    };
  }
}
