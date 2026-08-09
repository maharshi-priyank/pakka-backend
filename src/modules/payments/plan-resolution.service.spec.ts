import { PlanResolutionService } from './plan-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayProvider } from './razorpay.provider';

describe('PlanResolutionService', () => {
  const prisma = {
    billingConfig: {
      findUnique: jest.fn(),
    },
  };
  const razorpay = {
    getOrCreatePlanId: jest.fn(),
  };

  let service: PlanResolutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billingConfig.findUnique.mockResolvedValue({
      foundingPeriodEnds: new Date('2026-01-01T00:00:00.000Z'),
      earlyAccessPeriodEnds: new Date('2026-02-01T00:00:00.000Z'),
    });
    service = new PlanResolutionService(
      prisma as unknown as PrismaService,
      razorpay as unknown as RazorpayProvider,
    );
  });

  it('serves the pricing catalogue without calling Razorpay', async () => {
    razorpay.getOrCreatePlanId.mockRejectedValue(
      new Error('Razorpay authentication failed'),
    );

    await expect(service.currentPricing()).resolves.toEqual({
      window: 'regular',
      pro: { planId: null, price: 149 },
      solo: { planId: null, price: 149 },
      studio: { planId: null, price: 650 },
    });
    expect(razorpay.getOrCreatePlanId).not.toHaveBeenCalled();
  });
});
