Hostel monthly history Delete / Add New schema setup

1. Back up your ERP PostgreSQL database first.
2. In pgAdmin, select the exact database used by the backend and open Query Tool.
3. Run database/migrate_v24_hostel_monthly_periods.sql once.
4. Restart the backend and open Hostel Management.
5. Test one student's monthly History using a safe/test record first: delete one month, confirm only that month shows zero, then Add New and verify Dashboard and Hostel Report.

This is an additive migration. It creates the missing monthly period table, adds is_deleted and period_id, seeds one month from each existing legacy hostel record, and links payments by payment date when possible. The old schema has only one hostel_records fee row per student, so it cannot recreate historical monthly fee amounts that were never stored. Do not claim historical months were reconstructed by this migration.
