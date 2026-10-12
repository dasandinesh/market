import { buildWhatsAppMessage, buildWhatsAppWebUrl, normalizeWhatsAppPhone } from './billShare';

test('PDF accompaniment includes saved bill metadata and total without claiming a file was attached', () => {
  const sale = {
    customer: { name: 'Saved Customer' },
    products: [{ name: 'Product', base_price: 999 }],
    bill_details: {
      order_sno: 'SALE-123',
      date: '2026-10-10T12:00:00',
      bill_amount: 123.456,
      subtotal: 999,
      old_balance: 50,
      net_balance: 100,
    },
  };

  const message = buildWhatsAppMessage(sale, { header: 'Thank you', name: 'Market & Sons' }, { name: 'Changed Customer', oldBalance: 1000 });

  expect(message).toBe('Thank you\nMarket & Sons\n\nSale bill: SALE-123\nCustomer: Saved Customer\nDate: 2026-10-10\nBill total: ₹123.46');
  expect(message).not.toMatch(/attached|attachment/i);
  expect(message).not.toContain('999');
});

test('older records use the available customer, bill number, and billing date', () => {
  const message = buildWhatsAppMessage({
    customer: { name: ' ' },
    bill_details: { order_no: 'OLD-42', bill_date: '2026-09-01T12:00:00', bill_amount: '75.5' },
  }, {}, { name: 'Legacy Customer' });

  expect(message).toBe('Sale bill: OLD-42\nCustomer: Legacy Customer\nDate: 2026-09-01\nBill total: ₹75.50');
});

test('missing metadata and invalid dates use readable placeholders', () => {
  expect(buildWhatsAppMessage(null, null)).toBe('Sale bill: —\nCustomer: —\nDate: —\nBill total: ₹0.00');
  expect(buildWhatsAppMessage({ bill_details: { date: 'invalid date', bill_amount: 0 } })).toContain('Date: —\nBill total: ₹0.00');
});

test.each([
  ['9876543210', '919876543210'],
  ['98765 43210', '919876543210'],
  ['(98765) 43210', '919876543210'],
  ['98765-43210', '919876543210'],
  ['98765.43210', '919876543210'],
  [9876543210, '919876543210'],
  ['2345678901', '912345678901'],
  ['919876543210', '919876543210'],
  ['+91 98765 43210', '919876543210'],
  ['0091 98765 43210', '919876543210'],
  ['+1 (555) 123-4567', '15551234567'],
  ['00 44 7700 900123', '447700900123'],
])('normalizes WhatsApp phone %p to international digits', (raw, expected) => {
  expect(normalizeWhatsAppPhone(raw)).toBe(expected);
});

test.each([
  undefined,
  null,
  true,
  {},
  [],
  '',
  '   ',
  '12345',
  '+1 12345',
  '0000000000',
  '+0044 7700 900123',
  '+91 987654321',
  '+91 0987654321',
  '+1234567890123456',
  '98765abc43210',
  '98765/43210',
  '++91 9876543210',
  '91+9876543210',
  -9876543210,
  98765.4321,
  NaN,
  Infinity,
])('rejects invalid WhatsApp phone %p with a helpful error', (raw) => {
  expect(() => normalizeWhatsAppPhone(raw)).toThrow(/number|digits|country code/i);
});

test('unmarked numbers of other lengths require an explicit international prefix', () => {
  expect(() => normalizeWhatsAppPhone('15551234567')).toThrow(/country code with \+/i);
  expect(() => normalizeWhatsAppPhone('447700900123')).toThrow(/country code with \+/i);
  expect(normalizeWhatsAppPhone('+44 7700 900123')).toBe('447700900123');
});

test('WhatsApp Web links preserve message text and route to the normalized phone', () => {
  const message = 'Sale bill: A&B #1\nCustomer: തമിഴ் + മലയാളം\nBill total: ₹123.50';
  const url = new URL(buildWhatsAppWebUrl('98765 43210', message));

  expect(url.origin).toBe('https://web.whatsapp.com');
  expect(url.pathname).toBe('/send');
  expect(url.searchParams.get('phone')).toBe('919876543210');
  expect(url.searchParams.get('text')).toBe(message);
  expect(Array.from(url.searchParams.keys())).toEqual(['phone', 'text']);
  expect(url.hash).toBe('');
});

test('WhatsApp Web links normalize explicit international input and allow an empty accompaniment', () => {
  const url = new URL(buildWhatsAppWebUrl('+1 (555) 123-4567'));

  expect(url.searchParams.get('phone')).toBe('15551234567');
  expect(url.searchParams.get('text')).toBe('');
  expect(() => buildWhatsAppWebUrl('123', 'Bill')).toThrow(/number|digits/i);
});
