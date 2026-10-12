import { waitFor } from '@testing-library/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { BILL_STYLE } from './billTemplate';
import { downloadBillPdf } from './billPdf';

jest.mock('html2canvas', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
// Use the Node server renderer in jsdom while exercising the real bill template.
jest.mock('react-dom/server', () => jest.requireActual('react-dom/server.node'));

const sale = (count = 1) => ({
  _id: 'sale-123',
  customer: { name: 'தமிழ் வாடிக்கையாளர்' },
  products: Array.from({ length: count }, (_, index) => ({
    name: `தக்காளி ${index + 1}`,
    quantity: 2,
    bags: 1,
    single_price: 10,
    base_price: 20,
  })),
  bill_details: { order_sno: '2026/10:தமிழ்?', bill_amount: count * 20, subtotal: count * 20 },
});

let pdf;
let frame;
let fontsReady;
let appendedHtml;

beforeEach(() => {
  html2canvas.mockReset();
  jsPDF.mockReset();
  pdf = { addImage: jest.fn(), addPage: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
  jsPDF.mockImplementation(() => pdf);
  html2canvas.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,page' });
  fontsReady = Promise.resolve();
  frame = null;
  appendedHtml = '';
  const append = document.body.appendChild.bind(document.body);
  jest.spyOn(document.body, 'appendChild').mockImplementation((element) => {
    const result = append(element);
    if (element.tagName === 'IFRAME') {
      // jsdom does not navigate srcdoc, so emulate its browser load event.
      frame = element;
      appendedHtml = element.srcdoc;
      const frameDocument = element.contentDocument;
      frameDocument.open();
      frameDocument.write(element.srcdoc);
      frameDocument.close();
      Object.defineProperty(frameDocument, 'fonts', { value: { ready: fontsReady } });
      element.dispatchEvent(new Event('load'));
    }
    return result;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  frame?.remove();
});

test('exports each existing Tamil bill page to A5 and downloads one safely named PDF', async () => {
  const capturedPages = [];
  html2canvas.mockImplementation(async (element) => {
    capturedPages.push(element.textContent);
    expect(element.ownerDocument.querySelector('script')).toBeNull();
    return { toDataURL: () => `data:image/png;base64,page-${capturedPages.length}` };
  });

  const filename = await downloadBillPdf(sale(31), { name: 'தமிழ் கடை', header: 'நன்றி' });
  expect(filename).toBe('Sale-Bill-2026-10-தமிழ்-.pdf');
  expect(appendedHtml).toContain(BILL_STYLE);
  expect(appendedHtml).toContain('width: 132mm');
  expect(capturedPages).toHaveLength(2);
  expect(capturedPages[0]).toContain('தமிழ் கடை');
  expect(capturedPages[0]).toContain('தமிழ் வாடிக்கையாளர்');
  expect(capturedPages[0]).toContain('தக்காளி 1');
  expect(capturedPages[1]).toContain('தக்காளி 31');
  expect(capturedPages[1]).toContain('BILL TOTAL');
  expect(jsPDF).toHaveBeenCalledWith({ orientation: 'portrait', unit: 'mm', format: 'a5', compress: true });
  expect(pdf.addPage).toHaveBeenCalledTimes(1);
  expect(pdf.addImage.mock.calls.map((call) => call.slice(1, 7))).toEqual([
    ['PNG', 8, 8, 132, 193, 'bill-page-0'],
    ['PNG', 8, 8, 132, 193, 'bill-page-1'],
  ]);
  expect(html2canvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scale: 2 }));
  expect(pdf.save).toHaveBeenCalledTimes(1);
  expect(pdf.save).toHaveBeenCalledWith(filename, { returnPromise: true });
  expect(document.querySelector('iframe')).toBeNull();
});

test('waits for fonts before capturing the bill', async () => {
  let resolveFonts;
  fontsReady = new Promise((resolve) => { resolveFonts = resolve; });
  const download = downloadBillPdf(sale());
  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  expect(html2canvas).not.toHaveBeenCalled();
  expect(pdf.save).not.toHaveBeenCalled();
  resolveFonts();
  await download;
  expect(html2canvas).toHaveBeenCalledTimes(1);
  expect(document.querySelector('iframe')).toBeNull();
});

test('does not download a partial bill and removes the renderer when a page capture fails', async () => {
  html2canvas.mockResolvedValueOnce({ toDataURL: () => 'data:image/png;base64,first-page' })
    .mockRejectedValueOnce(new Error('Page rendering failed'));
  await expect(downloadBillPdf(sale(31))).rejects.toThrow('Page rendering failed');
  expect(pdf.addImage).toHaveBeenCalledTimes(1);
  expect(pdf.save).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
});

test('rejects empty bills before creating a renderer or PDF', async () => {
  await expect(downloadBillPdf(sale(0))).rejects.toThrow('no products');
  expect(document.querySelector('iframe')).toBeNull();
  expect(html2canvas).not.toHaveBeenCalled();
  expect(jsPDF).not.toHaveBeenCalled();
});

test('uses the record ID when the bill number is missing and cleans up save failures', async () => {
  const record = sale();
  delete record.bill_details.order_sno;
  pdf.save.mockRejectedValueOnce(new Error('Download failed'));
  await expect(downloadBillPdf(record)).rejects.toThrow('Download failed');
  expect(pdf.save).toHaveBeenCalledWith('Sale-Bill-sale-123.pdf', { returnPromise: true });
  expect(document.querySelector('iframe')).toBeNull();
});
