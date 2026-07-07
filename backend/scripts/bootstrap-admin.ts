import { getPlatformProxy } from 'wrangler';
import { bootstrapAdmin } from '../src/bootstrap-admin.js';

const [orgName, adminEmail, timezone] = process.argv.slice(2);

if (!orgName || !adminEmail) {
  console.error('Usage: bootstrap-admin.ts <org-name> <admin-email> [timezone]');
  process.exit(1);
}

const { env, dispose } = await getPlatformProxy<Env>({ environment: process.env.WRANGLER_ENV });

try {
  const result = await bootstrapAdmin(env.DB, orgName, adminEmail, timezone);
  console.log(
    `Created organization ${result.organizationId} ("${orgName}") with admin user ${result.userId} (${adminEmail})`,
  );
} finally {
  await dispose();
}
