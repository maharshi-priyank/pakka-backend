/**
 * Best-effort backfill: set contactId on CommunicationLog rows that predate
 * the U2 change (email.service.ts now stores contactId directly at send
 * time). For each row with contactId IS NULL, resolves the underlying
 * entity via entityId/entityType and copies its contactId if the entity
 * still exists and has one.
 *
 * entityType values with no contact concept ('user' — digest emails) are
 * left untouched, as are rows whose entity has since been deleted.
 *
 * Safe to re-run — only touches rows where contactId IS NULL.
 *
 *   npx tsx prisma/scripts/backfill-communication-log-contact-ids.ts        # dry run
 *   npx tsx prisma/scripts/backfill-communication-log-contact-ids.ts --apply # write changes
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['warn', 'error'] })

const APPLY = process.argv.includes('--apply')

async function resolveContactId(entityType: string | null, entityId: string | null): Promise<string | undefined> {
  if (!entityType || !entityId) return undefined

  switch (entityType) {
    case 'invoice': {
      const inv = await prisma.invoice.findUnique({ where: { id: entityId }, select: { contactId: true } })
      return inv?.contactId ?? undefined
    }
    case 'contract': {
      const c = await prisma.contract.findUnique({ where: { id: entityId }, select: { contactId: true } })
      return c?.contactId ?? undefined
    }
    case 'proposal': {
      const p = await prisma.proposal.findUnique({ where: { id: entityId }, select: { contactId: true } })
      return p?.contactId ?? undefined
    }
    case 'meeting': {
      const m = await prisma.meeting.findUnique({ where: { id: entityId }, select: { contactId: true } })
      return m?.contactId ?? undefined
    }
    case 'message': {
      const msg = await prisma.message.findUnique({ where: { id: entityId }, select: { thread: { select: { contactId: true } } } })
      return msg?.thread?.contactId ?? undefined
    }
    default:
      // 'lead', 'user' (digests), or anything else with no contact concept
      return undefined
  }
}

async function main() {
  const rows = await prisma.communicationLog.findMany({
    where:  { contactId: null },
    select: { id: true, entityId: true, entityType: true },
  })

  console.log(`CommunicationLog rows needing backfill: ${rows.length}`)
  if (rows.length === 0) {
    console.log('\nNothing to do.')
    return
  }
  console.log(APPLY ? '\nApplying updates…\n' : '\nDry run — no writes will happen. Pass --apply to write.\n')

  let updated = 0
  let skippedNoContactConcept = 0
  let skippedEntityGone = 0

  for (const row of rows) {
    if (!row.entityType || !['invoice', 'contract', 'proposal', 'meeting', 'message'].includes(row.entityType)) {
      skippedNoContactConcept++
      continue
    }

    const contactId = await resolveContactId(row.entityType, row.entityId)
    if (!contactId) {
      skippedEntityGone++
      continue
    }

    if (APPLY) {
      await prisma.communicationLog.update({ where: { id: row.id }, data: { contactId } })
    }
    updated++
  }

  console.log('── Summary ──────────────────────────────────────────────────────')
  console.log(`  ${APPLY ? 'Updated' : 'Would update'}              : ${updated}`)
  console.log(`  Skipped (no contact concept)  : ${skippedNoContactConcept}  ← entityType is 'lead'/'user' or unset`)
  console.log(`  Skipped (entity/contact gone) : ${skippedEntityGone}  ← underlying record deleted or never had a contact`)
  console.log('\nDone.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
