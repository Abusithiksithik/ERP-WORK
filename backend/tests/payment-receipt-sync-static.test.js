const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tuition = read('src/routes/payments.routes.ts');
const hostel = read('src/routes/hostel.routes.ts');
const exam = read('src/routes/examFees.routes.ts');
const reports = read('src/routes/reports.routes.ts');
const receiptUi = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend/src/pages/payments/PaymentReceipt.tsx'), 'utf8');

test('Payment Receipt sends tuition collections to the existing verified payments ledger', () => {
  assert.match(receiptUi, /api\.post\('\/payments'/);
  assert.match(tuition, /INSERT INTO payments/);
  assert.match(tuition, /'verified'/);
  assert.match(reports, /FROM payments p WHERE p\.enrollment_id=e\.id AND p\.status='verified'/);
});

test('Payment Receipt sends hostel collections to existing period-linked hostel payments', () => {
  assert.match(receiptUi, /api\.post\(`\/hostel\//);
  assert.match(hostel, /INSERT INTO hostel_payments/);
  assert.match(hostel, /period_id/);
  assert.match(reports, /FROM hostel_payments hp/);
});

test('Payment Receipt sends exam collections to exam history and synchronizes the exam fee record', () => {
  assert.match(receiptUi, /api\.post\(`\/exam-fees\//);
  assert.match(exam, /INSERT INTO exam_fee_payments/);
  assert.match(exam, /SET paid_amount = \(SELECT COALESCE\(SUM\(amount\),0\) FROM exam_fee_payments/);
  assert.match(reports, /COALESCE\(efr\.paid_amount,0\)::numeric AS amount_paid/);
});

test('Student details use a full-page view with a Back to Students action and retain per-category history', () => {
  assert.match(receiptUi, /Back to Students/);
  assert.match(receiptUi, /Payment History –/);
  assert.match(receiptUi, /<FiPrinter \/> Print/);
  assert.match(receiptUi, /Audit trail of every recorded payment/);
  assert.doesNotMatch(receiptUi, /gridTemplateColumns: 'minmax\(250px, 320px\) 1fr'/);
});
