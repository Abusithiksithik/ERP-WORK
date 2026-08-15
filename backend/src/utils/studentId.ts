import { query } from '../config/db';

export const generateStudentId = async (): Promise<string> => {
  const year = new Date().getFullYear().toString().slice(-2);
  const result = await query(
    `SELECT COUNT(*) as count FROM students WHERE student_id LIKE $1`,
    [`NA${year}%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  const padded = String(count).padStart(4, '0');
  return `NA${year}${padded}`;
};
