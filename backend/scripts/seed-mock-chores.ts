import { getPlatformProxy } from 'wrangler';
import { seedMockChores } from '../src/seed-mock-chores.js';

const [organizationIdArg] = process.argv.slice(2);
const organizationId = Number(organizationIdArg);

if (!organizationIdArg || Number.isNaN(organizationId)) {
  console.error('Usage: seed-mock-chores.ts <organization-id>');
  process.exit(1);
}

const { env, dispose } = await getPlatformProxy<Env>();

try {
  const result = await seedMockChores(env.DB, organizationId);
  console.log(`Seeded ${result.count} mock chore(s) into organization ${organizationId}`);
} finally {
  await dispose();
}
