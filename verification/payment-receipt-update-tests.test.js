const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../frontend/src/pages/payments/PaymentReceipt.tsx');
const source = fs.readFileSync(file, 'utf8');

test('receipt uses saved payment ID to generate deterministic unique bill number', () => {
  assert.match(source, /NH-\$\{prefix\}-\$\{form\.paymentDate\.replace\(\/-\/g, ''\)\}-\$\{String\(paymentId\)\.padStart\(6, '0'\)\}/);
  assert.match(source, /if \(!paymentId\) throw new Error/);
});

test('thermal receipt is formatted for 80mm roll and prints the sample identity fields', () => {
  assert.match(source, /@page\{size:80mm auto;margin:3mm\}/);
  for (const label of ['NALAM HEALTH CARE', 'Bill No.', 'Bill Date', 'Reg. No.', 'Student Name', 'Bill Amt.', 'Total Paid', 'Balance Due']) {
    assert.ok(source.includes(label), `missing receipt field ${label}`);
  }
});

test('QR payload contains bill, student and paid/pending payment details', () => {
  for (const key of ['billNo:', 'billDate:', 'registrationNo:', 'studentName:', 'feeCategory:', 'amountPaidThisBill:', 'totalPaidAfterThisBill:', 'pendingAfterThisBill:', 'paymentMethod:', 'transactionReference:']) {
    assert.ok(source.includes(key), `missing QR payload key ${key}`);
  }
  assert.match(source, /qrcodejs\/1\.0\.0\/qrcode\.min\.js/);
});

test('Adjustment and Add Student both navigate to New Candidates starting page', () => {
  assert.equal((source.match(/navigate\('\/new-admissions'\)/g) || []).length, 4);
  assert.match(source, />Adjustment<\/button>/);
  assert.match(source, />Add Student<\/button>/);
});
