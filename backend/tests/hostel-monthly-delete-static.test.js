const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const hostel = fs.readFileSync(path.join(root, 'backend/src/routes/hostel.routes.ts'), 'utf8');
const reports = fs.readFileSync(path.join(root, 'backend/src/routes/reports.routes.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'frontend/src/pages/hostel/HostelList.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database/migrate_v18_hostel_monthly_delete.sql'), 'utf8');

test('monthly delete is soft-delete and does not physically remove payment transactions', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(hostel, /UPDATE hostel_fee_periods SET is_deleted=TRUE/i);
  assert.doesNotMatch(hostel.match(/router\.delete\('\/:id\/history\/periods\/:periodId'[\s\S]*?\n\}\);/)?.[0] || '', /DELETE FROM hostel_payments/i);
});

test('monthly restore validates non-negative hostel and mess fee and reactivates the same period', () => {
  assert.match(hostel, /router\.post\('\/:id\/history\/periods\/:periodId\/restore'/);
  assert.match(hostel, /SET is_deleted=FALSE, hostel_fee=\$1, mess_fee=\$2/i);
  assert.match(hostel, /hostelFee < 0 \|\| messFee < 0/);
});

test('dashboard and report exclude deleted periods from fee and payment rollups', () => {
  assert.match(hostel, /COALESCE\(fp_due\.is_deleted, FALSE\)=FALSE/);
  assert.match(hostel, /COALESCE\(fp_paid\.is_deleted, FALSE\)=FALSE/);
  assert.match(reports, /COALESCE\(fp_due\.is_deleted,FALSE\)=FALSE/);
  assert.match(reports, /COALESCE\(fp_paid\.is_deleted,FALSE\)=FALSE/);
});

test('history UI shows zero amounts and Add New for deleted months', () => {
  assert.match(ui, /deleted \? 0 : period\.hostel_fee/);
  assert.match(ui, /deleted \? 0 : period\.mess_fee/);
  assert.match(ui, /<FiPlus \/> Add New/);
  assert.match(ui, /deleteMonthlyFee\(period\)/);
});
