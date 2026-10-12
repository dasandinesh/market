const present = (value) => value !== undefined && value !== null && value !== '';
const text = (value) => present(value) ? String(value).trim() : '';

const billDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  // Match the date shown on the printable bill in the user's timezone.
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split('T')[0];
};

// Accompany the downloaded PDF without claiming it has already been attached.
export const buildWhatsAppMessage = (sale, shop = {}, customer = null) => {
  const bill = sale?.bill_details || {};
  const lines = [text(shop?.header), text(shop?.name)].filter(Boolean);
  if (lines.length) lines.push('');
  lines.push(
    `Sale bill: ${text(bill.order_sno) || text(bill.order_no) || '—'}`,
    `Customer: ${text(sale?.customer?.name) || text(customer?.name) || '—'}`,
    `Date: ${billDate(bill.date || bill.bill_date)}`,
    `Bill total: ₹${Number(bill.bill_amount || 0).toFixed(2)}`,
  );
  return lines.join('\n');
};

export const normalizeWhatsAppPhone = (raw) => {
  if ((typeof raw !== 'string' && typeof raw !== 'number') || !String(raw).trim()) {
    throw new Error("Enter the customer's WhatsApp number.");
  }
  if (typeof raw === 'number' && (!Number.isSafeInteger(raw) || raw <= 0)) {
    throw new Error('Enter a valid phone number using digits and an optional +country code.');
  }
  const value = String(raw).trim();
  if (!/^\+?[\d\s().-]+$/.test(value)) {
    throw new Error('Enter a valid phone number using digits and an optional +country code.');
  }
  const hasPlus = value.startsWith('+');
  let digits = value.replace(/\D/g, '');
  const hasInternationalPrefix = !hasPlus && digits.startsWith('00');
  if (hasInternationalPrefix) digits = digits.slice(2);

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error('Enter a valid WhatsApp number with 8–15 digits, including the country code when needed.');
  }

  if (hasPlus || hasInternationalPrefix) {
    if (digits.startsWith('91') && !/^91[1-9]\d{9}$/.test(digits)) {
      throw new Error('Indian WhatsApp numbers need 10 digits after +91, without a leading zero.');
    }
    return digits;
  }
  if (digits.length === 10) return `91${digits}`;
  if (/^91[1-9]\d{9}$/.test(digits)) return digits;
  throw new Error('Include the country code with + for international numbers, for example +44 7700 900123.');
};

// Pass the original phone input so an explicit international prefix is retained.
export const buildWhatsAppWebUrl = (phone, message = '') => {
  const params = new URLSearchParams({
    phone: normalizeWhatsAppPhone(phone),
    text: String(message ?? ''),
  });
  return `https://web.whatsapp.com/send?${params.toString()}`;
};
