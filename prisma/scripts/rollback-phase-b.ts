/**
 * Phase B rollback: clears all contactId backfill and deletes all contacts.
 * Safe ONLY before Phase C code is deployed (no app code writing contactId yet).
 *
 * This is non-destructive to legacy data — leads, clients, and their FKs are untouched.
 *
 *   npx tsx prisma/scripts/rollback-phase-b.ts
 *
 * Requires confirmation: set env CONFIRM_ROLLBACK=yes
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['warn', 'error'] })

async function main() {
  if (process.env.CONFIRM_ROLLBACK !== 'yes') {
    console.error('Set CONFIRM_ROLLBACK=yes to proceed with Phase B rollback.')
    process.exit(1)
  }

  console.log('Rolling back Phase B…')

  // ── Clear contactId on all FK tables ────────────────────────────────────────
  await prisma.$executeRaw`UPDATE "projects"     SET "contactId" = NULL, "projectStage" = NULL`
  console.log('  cleared projects.contactId + projectStage')

  await prisma.$executeRaw`UPDATE "threads"      SET "contactId" = NULL`
  console.log('  cleared threads.contactId')

  await prisma.$executeRaw`UPDATE "meetings"     SET "contactId" = NULL`
  console.log('  cleared meetings.contactId')

  await prisma.$executeRaw`UPDATE "proposals"    SET "contactId" = NULL`
  console.log('  cleared proposals.contactId')

  await prisma.$executeRaw`UPDATE "contracts"    SET "contactId" = NULL`
  console.log('  cleared contracts.contactId')

  await prisma.$executeRaw`UPDATE "invoices"     SET "contactId" = NULL`
  console.log('  cleared invoices.contactId')

  await prisma.$executeRaw`UPDATE "time_entries" SET "contactId" = NULL`
  console.log('  cleared time_entries.contactId')

  await prisma.$executeRaw`UPDATE "expenses"     SET "contactId" = NULL`
  console.log('  cleared expenses.contactId')

  await prisma.$executeRaw`UPDATE "attachments"  SET "contactId" = NULL`
  console.log('  cleared attachments.contactId')

  await prisma.$executeRaw`UPDATE "client_notes" SET "contactId" = NULL`
  console.log('  cleared client_notes.contactId')

  await prisma.$executeRaw`UPDATE "discovered_leads" SET "importedAsContactId" = NULL`
  console.log('  cleared discovered_leads.importedAsContactId')

  // ── Restore AutomationRule keys ──────────────────────────────────────────────
  const KEY_RESTORE: Record<string, { key: string; triggerEvent: string }> = {
    'contact.cold.d7': { key: 'lead.cold.d7', triggerEvent: 'schedule.lead.cold' },
    'contact.created': { key: 'lead.created', triggerEvent: 'event.lead.created' },
  }
  for (const [oldKey, original] of Object.entries(KEY_RESTORE)) {
    const updated = await prisma.automationRule.updateMany({
      where: { key: oldKey },
      data:  { key: original.key, triggerEvent: original.triggerEvent },
    })
    if (updated.count > 0) {
      console.log(`  restored ${updated.count} rule(s): ${oldKey} → ${original.key}`)
    }
  }

  // ── Delete all contacts ──────────────────────────────────────────────────────
  // CASCADE will handle Attachment/Thread/ClientNote contactId FK rows, but those
  // were already nulled above (Attachment/Thread contactId is ON DELETE CASCADE in schema,
  // meaning deleting the contact would also delete those records — but we nulled them first
  // to prevent that cascade).
  const deleted = await prisma.contact.deleteMany({})
  console.log(`  deleted ${deleted.count} contacts`)

  console.log('\nPhase B rollback complete. Legacy data is intact.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
