import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayProvider } from './razorpay.provider';

export type PlanTier = 'SOLO' | 'STUDIO';

export interface ResolvedPlan {
  planId: string;
  price: number;
  window: 'founding' | 'earlyaccess' | 'regular';
  windowEnds?: Date;
}

const PRICES: Record<PlanTier, Record<string, number>> = {
  SOLO:   { founding: 149, earlyaccess: 199, regular: 299 },
  STUDIO: { founding: 349, earlyaccess: 499, regular: 699 },
};

@Injectable()
export class PlanResolutionService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly razorpay: RazorpayProvider,
  ) {}

  async resolve(tier: PlanTier, now: Date = new Date()): Promise<ResolvedPlan> {
    const config = await this.prisma.billingConfig.findUnique({ where: { id: 'singleton' } });

    let window: 'founding' | 'earlyaccess' | 'regular';
    let windowEnds: Date | undefined;

    if (config && now <= config.foundingPeriodEnds) {
      window     = 'founding';
      windowEnds = config.foundingPeriodEnds;
    } else if (config && now <= config.earlyAccessPeriodEnds) {
      window     = 'earlyaccess';
      windowEnds = config.earlyAccessPeriodEnds;
    } else {
      window = 'regular';
    }

    const price  = PRICES[tier][window];
    const planId = await this.razorpay.getOrCreatePlanId(tier, window, price);

    return { planId, price, window, windowEnds };
  }

  async currentPricing(): Promise<{
    window: string;
    windowEnds?: Date;
    solo: { planId: string; price: number };
    studio: { planId: string; price: number };
  }> {
    const now = new Date();
    const [solo, studio] = await Promise.all([
      this.resolve('SOLO', now),
      this.resolve('STUDIO', now),
    ]);

    return {
      window:    solo.window,
      windowEnds: solo.windowEnds,
      solo:   { planId: solo.planId,   price: solo.price },
      studio: { planId: studio.planId, price: studio.price },
    };
  }
}
