import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AdminRole, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const databaseUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_SEED_PASSWORD;
const name = process.env.ADMIN_SEED_NAME?.trim() || 'Demo Admin';
const requestedRole =
  process.env.ADMIN_SEED_ROLE?.trim().toUpperCase() || AdminRole.SUPERADMIN;

function requireConfiguration() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_URL must be configured.');
  }

  if (!email) {
    throw new Error('ADMIN_SEED_EMAIL must be configured.');
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('ADMIN_SEED_EMAIL must be a valid email address.');
  }

  if (!password) {
    throw new Error('ADMIN_SEED_PASSWORD must be configured.');
  }

  if (password.length < 8) {
    throw new Error('ADMIN_SEED_PASSWORD must be at least 8 characters long.');
  }

  if (!Object.values(AdminRole).includes(requestedRole as AdminRole)) {
    throw new Error(
      `ADMIN_SEED_ROLE must be one of: ${Object.values(AdminRole).join(', ')}.`,
    );
  }
}

async function main() {
  requireConfiguration();

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const passwordHash = await bcrypt.hash(password!, 12);
    const admin = await prisma.adminUser.upsert({
      where: { email: email! },
      create: {
        email: email!,
        passwordHash,
        name,
        role: requestedRole as AdminRole,
      },
      update: {
        passwordHash,
        name,
        role: requestedRole as AdminRole,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    console.log(`Admin seed complete: ${admin.email} (${admin.role})`);
    console.log('The configured demo password was hashed and was not printed.');
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      throw new Error(
        'The admin_users table does not exist. Apply the admin migration before running npm run seed:admin.',
      );
    }

    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Admin seed failed: ${message}`);
  process.exitCode = 1;
});
