import { prisma } from '../server/db/client';

(async function main() {
  try {
    console.log('[check-prisma] attempting to connect...');
    await prisma.$connect();
    console.log('[check-prisma] connected OK');
  } catch (err) {
    console.error('[check-prisma] connect failed:');
    console.error(err);
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {}
  }
})();
