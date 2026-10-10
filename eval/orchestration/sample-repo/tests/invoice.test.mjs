import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeInvoice } from '../src/invoice.mjs'

test('summarizeInvoice returns subtotal, tax, and total', () => {
  assert.deepEqual(summarizeInvoice([{ quantity: 2, unitPrice: 5 }], 0.1), {
    subtotal: 10,
    tax: 1,
    total: 11,
  })
})
