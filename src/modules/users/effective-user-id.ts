import { User } from '@prisma/client'

/** Returns the workspace owner's ID. Team members operate in their owner's workspace. */
export function effectiveUserId(user: Pick<User, 'id' | 'ownerId'>): string {
  return user.ownerId ?? user.id
}
