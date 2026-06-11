-- Add assigneeId to tasks
ALTER TABLE "tasks" ADD COLUMN "assigneeId" TEXT;

-- FK constraint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");
