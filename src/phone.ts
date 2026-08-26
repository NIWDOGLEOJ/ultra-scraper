/** Reads the number straight out of Maps' `data-item-id="phone:tel:+91..."`, which is locale-independent. */
export function phoneFromDataItemId(dataItemId: string | null | undefined): string {
  const match = /^phone:tel:(.+)$/i.exec((dataItemId ?? '').trim());
  if (!match) return '';
  try { return decodeURIComponent(match[1] ?? '').trim(); } catch { return (match[1] ?? '').trim(); }
}

/** Fallback for the aria-label form ("Phone: +91 44 1234 5678"), which only works on the English UI. */
export function extractPublicPhone(value: string): string {
  const phone = value.replace(/^phone:\s*/i, '').trim();
  return /\d/.test(phone) && !/^send to phone$/i.test(phone) ? phone : '';
}
