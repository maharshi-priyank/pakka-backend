/**
 * Targeted backfill: set contactId on TimeEntry and Expense rows that have
 * clientId set but contactId = null (created after Phase B migration ran).
 *
 * Uses Project.clientId → Project.contactId as the mapping source since
 * the main migration already populated that mapping on all projects.
 *
 * Safe to re-run — only touches rows where contactId IS NULL.
 *
 *   npx tsx prisma/scripts/backfill-contact-ids.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['warn', 'error'] })

async function buildClientToContactMap(workspaceId: string): Promise<Map<string, string>> {
  const projects = await prisma.project.findMany({
    where:  { workspaceId, clientId: { not: null }, contactId: { not: null } },
    select: { clientId: true, contactId: true },
  })

  const map = new Map<string, string>()
  for (const p of projects) {
    if (p.clientId && p.contactId) map.set(p.clientId, p.contactId)
  }
  return map
}

async function main() {
  // ── Audit first ───────────────────────────────────────────────────────────
  const pendingTimeEntries = await prisma.timeEntry.count({
    where: { clientId: { not: null }, contactId: null },
  })
  const pendingExpenses = await prisma.expense.count({
    where: { clientId: { not: null }, contactId: null },
  })

  console.log(`Time entries needing backfill : ${pendingTimeEntries}`)
  console.log(`Expenses needing backfill     : ${pendingExpenses}`)

  if (pendingTimeEntries === 0 && pendingExpenses === 0) {
    console.log('\nNothing to do — all records already have contactId.')
    return
  }

  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  console.log(`\nProcessing ${workspaces.length} workspace(s)…\n`)

  let totalTimeEntries = 0
  let totalExpenses    = 0
  let totalSkipped     = 0

  for (const { id: workspaceId } of workspaces) {
    const clientToContact = await buildClientToContactMap(workspaceId)
    if (clientToContact.size === 0) continue

    // ── TimeEntries ──────────────────────────────────────────────────────────
    const timeEntries = await prisma.timeEntry.findMany({
      where:  { workspaceId, clientId: { not: null }, contactId: null },
      select: { id: true, clientId: true },
    })

    for (const te of timeEntries) {
      const contactId = te.clientId ? clientToContact.get(te.clientId) : undefined
      if (contactId) {
        await prisma.timeEntry.update({ where: { id: te.id }, data: { contactId } })
        totalTimeEntries++
      } else {
        totalSkipped++
        console.warn(`  [skip] TimeEntry ${te.id} — clientId ${te.clientId} not in project map`)
      }
    }

    // ── Expenses ─────────────────────────────────────────────────────────────
    const expenses = await prisma.expense.findMany({
      where:  { workspaceId, clientId: { not: null }, contactId: null },
      select: { id: true, clientId: true },
    })

    for (const e of expenses) {
      const contactId = e.clientId ? clientToContact.get(e.clientId) : undefined
      if (contactId) {
        await prisma.expense.update({ where: { id: e.id }, data: { contactId } })
        totalExpenses++
      } else {
        totalSkipped++
        console.warn(`  [skip] Expense ${e.id} — clientId ${e.clientId} not in project map`)
      }
    }

    if (timeEntries.length + expenses.length > 0) {
      console.log(
        `  ${workspaceId}: fixed timeEntries=${timeEntries.length} expenses=${expenses.length}`,
      )
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────')
  console.log(`  TimeEntries backfilled : ${totalTimeEntries}`)
  console.log(`  Expenses backfilled    : ${totalExpenses}`)
  if (totalSkipped > 0) {
    console.log(`  Skipped (no mapping)   : ${totalSkipped}  ← these clients had no projects; check manually`)
  }
  console.log('\nDone.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
