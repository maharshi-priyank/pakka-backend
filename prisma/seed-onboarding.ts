import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const result = await prisma.user.updateMany({
    data: { onboardingComplete: false },
  })
  console.log(`Reset onboardingComplete=false for ${result.count} users`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
