import { getPlatformProxy } from 'wrangler';
import { seedMockChores } from '../src/seed-mock-chores.js';

const [householdIdArg] = process.argv.slice(2);
const householdId = Number(householdIdArg);

if (!householdIdArg || Number.isNaN(householdId)) {
  console.error('Usage: seed-mock-chores.ts <household-id>');
  process.exit(1);
}

const { env, dispose } = await getPlatformProxy<Env>();

try {
  const result = await seedMockChores(env.DB, householdId);
  console.log(`Seeded ${result.count} mock chore(s) into household ${householdId}`);
} finally {
  await dispose();
}
