import { Plan, SubscriptionStatus } from '@prisma/client';

interface UserPlanFields {
  plan: Plan;
  planExpiresAt: Date | null;
  subscriptionStatus: SubscriptionStatus;
}

export function effectivePlan(user: UserPlanFields): Plan {
  if (user.subscriptionStatus === SubscriptionStatus.ACTIVE) return user.plan;
  if (user.planExpiresAt && user.planExpiresAt > new Date()) return user.plan;
  // Permanent grant (promo with no expiry): plan is set, no subscription, not cancelled
  if (
    user.plan !== Plan.FREE &&
    user.planExpiresAt === null &&
    user.subscriptionStatus !== SubscriptionStatus.CANCELLED
  ) return user.plan;
  return Plan.FREE;
}
