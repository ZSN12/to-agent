export function summarizeInvoice(lines) {
  return lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0)
}
