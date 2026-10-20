const assert = require('node:assert/strict');

function balance(bills, payments) {
  return Math.max(0, bills.reduce((s, n) => s + n, 0) - payments.reduce((s, n) => s + n, 0));
}
function canPay(bills, payments, proposed) {
  return proposed > 0 && proposed <= balance(bills, payments);
}

assert.equal(balance([10000, 10000], [8000]), 12000);
assert.equal(balance([10000, 10000], [8000, 12000]), 0);
assert.equal(balance([10000, 10000], [8000, 11000]), 1000);
assert.equal(canPay([10000, 10000], [8000], 12000), true);
assert.equal(canPay([10000, 10000], [8000], 13000), false);
assert.equal(balance([5000, 5000, 5000], [4000, 2000]), 9000);
console.log('Hostel payment carry-forward regression examples: PASS');
