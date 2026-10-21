Hostel monthly Delete / Add New feature deployment

1. Back up the database before applying schema changes.
2. Run migrate_v18_hostel_monthly_delete.sql against the same PostgreSQL database used by the ERP.
3. In backend and frontend, run npm install (or npm ci) after extracting the ZIP.
4. Run npm run build in backend and frontend so the dist/build outputs match the updated source.
5. Restart the backend and test one student with a disposable/test month before using real payment data.

This migration adds is_deleted to hostel_fee_periods. The feature uses soft-delete; it does not physically delete payment transactions.
