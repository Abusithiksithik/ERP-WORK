import { PoolClient } from 'pg';

export const generateStudentId = async (client: PoolClient): Promise<string> => {
  const year = new Date().getFullYear().toString().slice(-2);
  // Transaction-scoped lock prevents duplicate IDs when multiple admissions
  // are created concurrently. The caller must already be in a transaction.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`student-id-${year}`]);
  const result = await client.query(
    `SELECT COUNT(*) AS count FROM students WHERE student_id LIKE $1`,
    [`NA${year}%`]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `NA${year}${String(count).padStart(4, '0')}`;
};
