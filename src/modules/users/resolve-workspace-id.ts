import { User } from '@prisma/client'

/** Returns the active workspace ID for the authenticated user.
 *  Owners: their own workspace (workspace.id = user.id).
 *  Team members: their owner's workspace (activeWorkspaceId set on signup).
 *  Falls back to ownerId → id for backwards compat during transition. */
export function resolveWorkspaceId(
  user: Pick<User, 'id' | 'ownerId' | 'activeWorkspaceId'>,
): string {
  return user.activeWorkspaceId ?? user.ownerId ?? user.id
}
