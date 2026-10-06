import { PoolClient } from 'pg';

export const generateStudentId = async (client: PoolClient): Promise<string> => {
  const year = new Date().getFullYear().toString().slice(-2);

  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [`student-id-${year}`]
  );

  const result = await client.query(
    `SELECT COALESCE(
       MAX(CAST(RIGHT(student_id, 4) AS INTEGER)),
       0
     ) AS max_number
     FROM students
     WHERE student_id LIKE $1`,
    [`NA${year}%`]
  );

  const nextNumber = parseInt(result.rows[0].max_number, 10) + 1;

  return `NA${year}${String(nextNumber).padStart(4, '0')}`;
};