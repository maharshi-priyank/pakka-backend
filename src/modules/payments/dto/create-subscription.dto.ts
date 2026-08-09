import { IsIn } from 'class-validator';
import type { PlanTier } from '../plan-resolution.service';

export class CreateSubscriptionDto {
  @IsIn(['PRO', 'STUDIO', 'SOLO'])
  tier: PlanTier;
}
