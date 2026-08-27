/**
 * Run this ONCE on the server to reset all staff passwords:
 *   node reset-passwords.js
 * 
 * This generates the hash on YOUR server using YOUR bcryptjs version.
 */
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'epft',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '12345',
});

async function run() {
  await client.connect();
  console.log('Connected to database');

  const password = 'Admin@123';
  const hash = bcrypt.hashSync(password, 10);

  console.log('Generated hash:', hash);
  console.log('Verify:', bcrypt.compareSync(password, hash));

  // Update all staff passwords
  const result = await client.query(
    `UPDATE users SET password_hash = $1
     WHERE role IN ('super_admin','admin','incharge','teacher')
     RETURNING email, role`,
    [hash]
  );

  console.log('\nPasswords reset for:');
  result.rows.forEach(r => console.log(' -', r.role, ':', r.email));

  // Insert missing accounts
  const users = [
    { email: 'admin2@nalamacademy.com',   role: 'admin',    name: 'Admin User' },
    { email: 'incharge@nalamacademy.com', role: 'incharge', name: 'Incharge User' },
    { email: 'teacher@nalamacademy.com',  role: 'teacher',  name: 'Teacher User' },
  ];

  for (const u of users) {
    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (email) DO UPDATE SET password_hash=$3, role=$4, is_active=true`,
      [u.name, u.email, hash, u.role]
    );
    console.log('Seeded:', u.email);
  }

  await client.end();
  console.log('\nDone! All passwords set to: Admin@123');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
