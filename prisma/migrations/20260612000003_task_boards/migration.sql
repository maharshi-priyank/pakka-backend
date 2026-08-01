-- CreateTable task_boards
CREATE TABLE "task_boards" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "projectId" TEXT,
  "name"      TEXT NOT NULL,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable board_columns
CREATE TABLE "board_columns" (
  "id"       TEXT NOT NULL,
  "boardId"  TEXT NOT NULL,
  "name"     TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isDone"   BOOLEAN NOT NULL DEFAULT false,
  "color"    TEXT,
  CONSTRAINT "board_columns_pkey" PRIMARY KEY ("id")
);

-- AlterTable tasks
ALTER TABLE "tasks" ADD COLUMN "columnId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "task_boards_userId_idx" ON "task_boards"("userId");
CREATE INDEX "task_boards_projectId_idx" ON "task_boards"("projectId");
CREATE INDEX "board_columns_boardId_idx" ON "board_columns"("boardId");
CREATE INDEX "tasks_columnId_idx" ON "tasks"("columnId");

-- AddForeignKey
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "task_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "board_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
