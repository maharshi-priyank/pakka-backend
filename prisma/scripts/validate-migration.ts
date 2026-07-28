/**
 * Phase B validation: read-only checks that the backfill landed correctly.
 * Exits 0 when all checks pass; exits 1 and prints failures otherwise.
 *
 *   npx tsx prisma/scripts/validate-migration.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['warn', 'error'] })

type Check = { name: string; pass: boolean; detail?: string }

async function main() {
  const failures: Check[] = []

  function check(name: string, pass: boolean, detail?: string) {
    const icon = pass ? '✓' : '✗'
    console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`)
    if (!pass) failures.push({ name, pass, detail })
  }

  // ── 1. Every workspace has contacts ─────────────────────────────────────────
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, _count: { select: { leads: true, clients: true, contacts: true } } },
  })

  let wsWithLeadsOrClients = 0
  let wsWithContacts = 0
  for (const ws of workspaces) {
    const hasData    = ws._count.leads > 0 || ws._count.clients > 0
    const hasContact = ws._count.contacts > 0
    if (hasData) wsWithLeadsOrClients++
    if (hasData && hasContact) wsWithContacts++
  }
  check(
    'All workspaces with leads/clients have contacts',
    wsWithLeadsOrClients === wsWithContacts,
    `${wsWithContacts}/${wsWithLeadsOrClients} workspaces`,
  )

  // ── 2. Contact count ≥ unique (client ∪ standalone-lead) per workspace ───────
  for (const ws of workspaces) {
    const clientCount    = ws._count.clients
    const standaloneLeads = await prisma.lead.count({ where: { workspaceId: ws.id, clientId: null } })
    const expected = clientCount + standaloneLeads
    const actual   = ws._count.contacts
    check(
      `Workspace ${ws.id} contact count`,
      actual >= expected,
      `actual=${actual} expected>=${expected} (clients=${clientCount} + standaloneLeads=${standaloneLeads})`,
    )
  }

  // ── 3. No null contactId on clients' related records ──────────────────────────
  // Projects with a clientId should have a contactId
  const projectsMissingContact = await prisma.project.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('Projects with clientId also have contactId', projectsMissingContact === 0, `missing=${projectsMissingContact}`)

  const threadsMissingContact = await prisma.thread.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('Threads with clientId also have contactId', threadsMissingContact === 0, `missing=${threadsMissingContact}`)

  const meetingsMissingContact = await prisma.meeting.count({
    where: {
      OR: [{ clientId: { not: null } }, { leadId: { not: null } }],
      contactId: null,
    },
  })
  check('Meetings with clientId/leadId also have contactId', meetingsMissingContact === 0, `missing=${meetingsMissingContact}`)

  const proposalsMissing = await prisma.proposal.count({
    where: {
      OR: [{ clientId: { not: null } }, { leadId: { not: null } }],
      contactId: null,
    },
  })
  check('Proposals with clientId/leadId also have contactId', proposalsMissing === 0, `missing=${proposalsMissing}`)

  const contractsMissing = await prisma.contract.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('Contracts with clientId also have contactId', contractsMissing === 0, `missing=${contractsMissing}`)

  const invoicesMissing = await prisma.invoice.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('Invoices with clientId also have contactId', invoicesMissing === 0, `missing=${invoicesMissing}`)

  const timeEntriesMissing = await prisma.timeEntry.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('TimeEntries with clientId also have contactId', timeEntriesMissing === 0, `missing=${timeEntriesMissing}`)

  const expensesMissing = await prisma.expense.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('Expenses with clientId also have contactId', expensesMissing === 0, `missing=${expensesMissing}`)

  const attachmentsMissing = await prisma.attachment.count({
    where: { clientId: { not: null }, contactId: null },
  })
  check('Attachments with clientId also have contactId', attachmentsMissing === 0, `missing=${attachmentsMissing}`)

  const notesMissing = await prisma.clientNote.count({ where: { contactId: null } })
  check('ClientNotes all have contactId', notesMissing === 0, `missing=${notesMissing}`)

  // ── 4. No dangling contactId FK ──────────────────────────────────────────────
  // (Prisma enforces this via FK constraints, so just count as sanity check)
  const danglingProjects = await prisma.project.count({
    where: {
      contactId: { not: null },
      contact:   null,
    },
  })
  check('No projects with dangling contactId', danglingProjects === 0)

  // ── 5. Project.projectStage filled for all projects ─────────────────────────
  const projectsWithoutStage = await prisma.project.count({ where: { projectStage: null } })
  check('All projects have projectStage', projectsWithoutStage === 0, `missing=${projectsWithoutStage}`)

  // ── 6. AutomationRule old lead keys are gone ─────────────────────────────────
  const oldLeadRules = await prisma.automationRule.count({
    where: { key: { in: ['lead.cold.d7', 'lead.created'] } },
  })
  check('Old lead.* automation keys renamed', oldLeadRules === 0, `remaining=${oldLeadRules}`)

  // ── 7. Contact portalToken uniqueness ────────────────────────────────────────
  const tokenCount = await prisma.contact.count({ where: { portalToken: { not: null } } })
  const uniqueTokens = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "portalToken") AS count FROM contacts WHERE "portalToken" IS NOT NULL
  `
  const uniqueCount = Number(uniqueTokens[0]?.count ?? 0)
  check('Contact portalTokens are unique', tokenCount === uniqueCount, `total=${tokenCount} unique=${uniqueCount}`)

  // ── 8. DiscoveredLead.importedAsContactId coverage ──────────────────────────
  const dlWithLead    = await prisma.discoveredLead.count({ where: { importedAsLeadId: { not: null } } })
  const dlWithContact = await prisma.discoveredLead.count({ where: { importedAsContactId: { not: null } } })
  check(
    'DiscoveredLeads with importedAsLeadId also have importedAsContactId',
    dlWithContact >= dlWithLead,
    `${dlWithContact}/${dlWithLead}`,
  )

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('')
  if (failures.length === 0) {
    console.log('All checks passed — Phase B migration looks good.')
    process.exit(0)
  } else {
    console.log(`${failures.length} check(s) FAILED:`)
    failures.forEach(f => console.log(`  • ${f.name}${f.detail ? ': ' + f.detail : ''}`))
    process.exit(1)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
