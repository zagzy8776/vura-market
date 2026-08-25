import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(connectionString);
const result = await sql`SELECT release_expired_inventory_reservations() AS released`;
console.log(`Released ${Number(result[0]?.released || 0)} expired inventory reservation(s).`);
