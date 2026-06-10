import { Plan, SubscriptionStatus } from '@prisma/client';

interface UserPlanFields {
  plan: Plan;
  planExpiresAt: Date | null;
  subscriptionStatus: SubscriptionStatus;
}

export function effectivePlan(user: UserPlanFields): Plan {
  if (user.subscriptionStatus === SubscriptionStatus.ACTIVE) return user.plan;
  if (user.planExpiresAt && user.planExpiresAt > new Date()) return user.plan;
  return Plan.FREE;
}
