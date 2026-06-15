-- Fix: workspace_members.role was created as TEXT but Prisma expects a PostgreSQL enum type.
-- Must drop the default before altering type, then restore it as the enum value.

CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MEMBER');

ALTER TABLE "workspace_members" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "workspace_members"
  ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING "role"::"WorkspaceRole";

ALTER TABLE "workspace_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"WorkspaceRole";
