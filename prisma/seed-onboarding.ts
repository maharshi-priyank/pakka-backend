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
    where: { onboardingComplete: false },
    data:  { onboardingComplete: true },
  })
  console.log(`Set onboardingComplete=true for ${result.count} existing users`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
