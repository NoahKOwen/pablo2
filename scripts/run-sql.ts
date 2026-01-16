import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

async function run() {
  const prisma = new PrismaClient();
  try {
    const sqlPath = path.join(process.cwd(), 'prisma-sql', '001_add_notification_unread_index.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running SQL:', sqlPath);
    await prisma.$executeRawUnsafe(sql);
    console.log('Index applied successfully');
  } catch (err) {
    console.error('Failed to apply SQL:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
