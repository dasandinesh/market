import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fetchJson } from '../../api';
import { downloadBillPdf } from './billPdf';
import SaleBillList from './salebilllist';

jest.mock('../../api', () => ({ fetchJson: jest.fn() }));
jest.mock('./billPdf', () => ({ downloadBillPdf: jest.fn() }));

const response = (total, page = 1) => ({
  total,
  page,
  limit: 50,
  pages: Math.max(1, Math.ceil(total / 50)),
  data: Array.from({ length: Math.max(0, Math.min(50, total - (page - 1) * 50)) }, (_, index) => {
    const number = (page - 1) * 50 + index + 1;
    return {
      _id: `sale-${number}`,
      customer: { name: `Customer ${number}` },
      products: [{ name: 'Product One' }],
      bill_details: { order_sno: `BILL-${number}`, total_quantity: 1, bill_amount: 10, billed: true },
    };
  }),
});

const salesRequests = () => fetchJson.mock.calls.filter(([url]) => url.startsWith('/api/sales?'));
const requestParams = (index = salesRequests().length - 1) =>
  new URLSearchParams(salesRequests()[index][0].split('?')[1]);

const pagination = () => within(screen.getByRole('navigation', { name: 'bills pagination' }));
const pageButton = (name) => pagination().getByRole('button', { name });
const header = () => within(screen.getByRole('heading', { name: 'Sale Bills' }).closest('header'));
const filterForm = () => within(screen.getByLabelText('Search').closest('form'));
const filterButton = (name) => filterForm().getByRole('button', { name });
const rowAction = (action, billNumber) => within(screen.getByText(billNumber, { selector: 'td' }).closest('tr'))
  .getByRole('button', { name: `${action} bill ${billNumber}` });

let respondToSales;
let customerRecords;
let invoiceShop;

const waitUntilLoaded = () => {
  const listHeader = header();
  return waitFor(() => expect(listHeader.getByRole('button', { name: 'Refresh' })).toBeEnabled());
};

beforeEach(() => {
  fetchJson.mockReset();
  downloadBillPdf.mockReset();
  downloadBillPdf.mockResolvedValue('Sale-Bill-BILL-1.pdf');
  customerRecords = [];
  invoiceShop = {};
  respondToSales = (url) => {
    const params = new URLSearchParams(url.split('?')[1]);
    return Promise.resolve(response(120, Number(params.get('page'))));
  };
  fetchJson.mockImplementation((url) => {
    if (url === '/api/customers') return Promise.resolve(customerRecords);
    if (url === '/api/invoice-settings/active') return Promise.resolve(invoiceShop);
    if (url.startsWith('/api/sales?')) return respondToSales(url);
    return Promise.reject(new Error(`Unexpected API request: ${url}`));
  });
});

afterEach(() => { jest.restoreAllMocks(); });

test('hides product names in the list and shares the clicked bill before View', async () => {
  customerRecords = [{ name: 'Customer 2', phone: '9876543210' }];
  const chat = { opener: window };
  const open = jest.spyOn(window, 'open').mockReturnValue(chat);
  render(<SaleBillList />);
  await waitUntilLoaded();
  expect(screen.queryByRole('columnheader', { name: 'Products' })).not.toBeInTheDocument();
  expect(screen.queryByText('Product One')).not.toBeInTheDocument();
  const send = screen.getByRole('button', { name: 'Send bill BILL-2 on WhatsApp' });
  expect(send.nextElementSibling).toHaveTextContent('View');
  fireEvent.click(send);
  const url = new URL(open.mock.calls[0][0]);
  expect(url.searchParams.get('phone')).toBe('919876543210');
  expect(url.searchParams.get('text')).toContain('BILL-2');
  expect(screen.getByRole('article', { name: 'Sale bill BILL-2' })).toBeInTheDocument();
  expect(chat.opener).toBeNull();
});

test('loads 50 bills per page and navigates to the next and last server pages', async () => {
  render(<SaleBillList />);
  await waitUntilLoaded();
  expect(requestParams().get('limit')).toBe('50');
  expect(requestParams().get('page')).toBe('1');
  expect(screen.getByText('Customer 50')).toBeInTheDocument();
  expect(screen.queryByText('Customer 51')).not.toBeInTheDocument();
  expect(screen.getByText('Showing 1–50 of 120 bills')).toBeInTheDocument();
  expect(screen.getByText('₹500.00')).toBeInTheDocument();
  expect(pageButton('First')).toBeDisabled();

  fireEvent.click(pageButton('Next'));
  await screen.findByText('Customer 51');
  expect(requestParams().get('page')).toBe('2');
  expect(requestParams().get('limit')).toBe('50');

  fireEvent.click(pageButton('Last'));
  await screen.findByText('Customer 101');
  expect(requestParams().get('page')).toBe('3');
  expect(screen.getByText('₹200.00')).toBeInTheDocument();
  expect(pageButton('Next')).toBeDisabled();
  expect(pageButton('Last')).toBeDisabled();
});

test('paging and refreshing preserve submitted filters while Apply and Clear reset the page', async () => {
  render(<SaleBillList />);
  await waitUntilLoaded();
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Draft only' } });
  expect(salesRequests()).toHaveLength(1);
  fireEvent.click(pageButton('Next'));
  await waitUntilLoaded();
  expect(requestParams().get('q')).toBeNull();
  expect(requestParams().get('page')).toBe('2');

  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Applied customer' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'false' } });
  fireEvent.click(filterButton('Apply filters'));
  await waitUntilLoaded();
  expect(requestParams().get('page')).toBe('1');
  expect(requestParams().get('q')).toBe('Applied customer');

  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Unsubmitted customer' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'true' } });
  fireEvent.click(pageButton('Next'));
  await waitUntilLoaded();
  expect(requestParams().get('page')).toBe('2');
  expect(requestParams().get('q')).toBe('Applied customer');
  expect(requestParams().get('startDate')).toBe('2026-10-01');
  expect(requestParams().get('endDate')).toBe('2026-10-10');
  expect(requestParams().get('billed')).toBe('false');

  fireEvent.click(header().getByRole('button', { name: 'Refresh' }));
  await waitUntilLoaded();
  expect(requestParams().get('page')).toBe('2');
  expect(requestParams().get('q')).toBe('Applied customer');
  expect(requestParams().get('billed')).toBe('false');

  fireEvent.click(filterButton('Clear'));
  await waitUntilLoaded();
  expect(requestParams().get('page')).toBe('1');
  expect(requestParams().get('q')).toBeNull();
  expect(requestParams().get('startDate')).toBeNull();
  expect(requestParams().get('endDate')).toBeNull();
  expect(requestParams().get('billed')).toBeNull();
  expect(screen.getByLabelText('Search')).toHaveValue('');
  expect(screen.getByLabelText('Status')).toHaveValue('');
});

test('disables request controls while a page is loading', async () => {
  render(<SaleBillList />);
  await waitUntilLoaded();
  let resolvePage;
  respondToSales = () => new Promise((resolve) => { resolvePage = resolve; });
  fireEvent.click(pageButton('Next'));
  ['First', 'Previous', 'Next', 'Last'].forEach((name) => expect(pageButton(name)).toBeDisabled());
  ['Apply filters', 'Clear'].forEach((name) => expect(filterButton(name)).toBeDisabled());
  expect(header().getByRole('button', { name: /loading/i })).toBeDisabled();
  await act(async () => { resolvePage(response(120, 2)); });
  await waitUntilLoaded();
  expect(pageButton('Previous')).toBeEnabled();
});

test('refresh refetches the last valid page when the total shrinks', async () => {
  render(<SaleBillList />);
  await waitUntilLoaded();
  fireEvent.click(pageButton('Last'));
  await screen.findByText('Customer 101');
  respondToSales = jest.fn().mockResolvedValueOnce(response(60, 3)).mockResolvedValueOnce(response(60, 2));
  fireEvent.click(header().getByRole('button', { name: 'Refresh' }));
  await waitUntilLoaded();
  expect(requestParams(2).get('page')).toBe('3');
  expect(requestParams(3).get('page')).toBe('2');
  expect(screen.getByText('Customer 51')).toBeInTheDocument();
  expect(screen.getByText('Customer 60')).toBeInTheDocument();
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByText('₹100.00')).toBeInTheDocument();
  expect(pageButton('Next')).toBeDisabled();
});

test('shows an empty first page with all paging controls disabled', async () => {
  respondToSales = () => Promise.resolve(response(0));
  render(<SaleBillList />);
  await waitUntilLoaded();
  expect(screen.getByText('No sale bills match this filter.')).toBeInTheDocument();
  expect(screen.getByText('Showing 0–0 of 0 bills')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  ['First', 'Previous', 'Next', 'Last'].forEach((name) => {
    expect(pageButton(name)).toBeDisabled();
  });
});

test('clears the previous pager total after a failed request', async () => {
  render(<SaleBillList />);
  await waitUntilLoaded();
  respondToSales = () => Promise.reject(new Error('Unable to load bills'));
  fireEvent.click(pageButton('Next'));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load bills');
  expect(screen.queryByText('Customer 1')).not.toBeInTheDocument();
  expect(screen.getByText('Showing 0–0 of 0 bills')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  expect(pageButton('Next')).toBeDisabled();
  expect(pageButton('Last')).toBeDisabled();
});

const sampleSales = [
  {
    _id: 'sale-alpha',
    customer: { name: ' ANU ' },
    products: [{ _id: 'alpha-item', name: 'Alpha mango', quantity: 2, bags: 1, single_price: 20, base_price: 40 }],
    bill_details: { order_sno: 'SALE-A', date: '2026-10-10', subtotal: 40, bagAmountTotal: 8, bill_amount: 48, total_quantity: 2, debit: 10, old_balance: 100, net_balance: 138, billed: true },
  },
  {
    _id: 'sale-beta',
    customer: { name: 'Bala' },
    products: [{ _id: 'beta-item', name: 'Beta tomato', quantity: 3, bags: 0, single_price: 20, base_price: 60 }],
    bill_details: { order_sno: 'SALE-B', date: '2026-10-10', subtotal: 60, bill_amount: 60, total_quantity: 3, old_balance: 0, net_balance: 60, billed: true },
  },
];

const setupSampleBills = (total = 2) => {
  customerRecords = [{ name: 'Anu', phone: '9876543210', oldBalance: 900 }];
  invoiceShop = { name: 'Market Shop', area: 'Town' };
  respondToSales = () => Promise.resolve({ ...response(total), data: sampleSales });
};

const waitForBillActions = () => waitFor(() => {
  expect(screen.getByRole('button', { name: 'Print bill SALE-A' })).toBeEnabled();
});

test('each row prints only its own sale using the invoice template and selects its preview', async () => {
  setupSampleBills();
  const printWindow = { document: { write: jest.fn(), close: jest.fn() }, focus: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(printWindow);
  render(<SaleBillList />);
  await waitForBillActions();
  expect(screen.getAllByRole('button', { name: /^Print bill SALE-/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Print bill SALE-B' }));

  expect(open).toHaveBeenCalledWith('', '_blank', 'width=640,height=900');
  const html = printWindow.document.write.mock.calls[0][0];
  expect(html).toContain('Market Shop');
  expect(html).toContain('SALE-B');
  expect(html).toContain('Beta tomato');
  expect(html).not.toContain('SALE-A');
  expect(html).not.toContain('Alpha mango');
  expect(html).toContain('window.print()');
  expect(printWindow.document.close).toHaveBeenCalled();
  expect(printWindow.focus).toHaveBeenCalled();
  expect(screen.getByRole('article', { name: 'Sale bill SALE-B' })).toBeInTheDocument();
});

test('a blocked print popup shows feedback on the first bill selection', async () => {
  setupSampleBills();
  jest.spyOn(window, 'open').mockReturnValue(null);
  render(<SaleBillList />);
  await waitForBillActions();
  fireEvent.click(screen.getByRole('button', { name: 'Print bill SALE-A' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please allow popups to print the bill.');
  expect(screen.getByRole('article', { name: 'Sale bill SALE-A' })).toBeInTheDocument();
});

test('View shows the selected bill and saved balances in the right preview without opening a window', async () => {
  setupSampleBills();
  const open = jest.spyOn(window, 'open').mockReturnValue(null);
  render(<SaleBillList />);
  await waitForBillActions();
  const panel = screen.getByRole('complementary', { name: 'Selected sale bill' });
  expect(within(panel).getByText('Select a sale bill to preview it.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  const preview = within(panel).getByRole('article', { name: 'Sale bill SALE-A' });
  expect(within(preview).getByText('Alpha mango')).toBeInTheDocument();
  expect(within(preview).queryByText('Beta tomato')).not.toBeInTheDocument();
  expect(within(preview).getByText('Opening balance', { selector: 'dt' }).nextElementSibling).toHaveTextContent('₹100.00');
  expect(within(preview).getByText('Closing balance', { selector: 'dt' }).nextElementSibling).toHaveTextContent('₹138.00');
  expect(screen.getByRole('button', { name: 'View bill SALE-A' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-B' }));
  expect(within(panel).getByRole('article', { name: 'Sale bill SALE-B' })).toBeInTheDocument();
  expect(within(panel).queryByText('Alpha mango')).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
});

test('matches the customer name without case or outer whitespace and opens WhatsApp Web for an overridden number', async () => {
  setupSampleBills();
  const chat = { opener: 'parent' };
  const open = jest.spyOn(window, 'open').mockReturnValue(chat);
  render(<SaleBillList />);
  await waitForBillActions();
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  const phone = screen.getByLabelText('WhatsApp number');
  expect(phone).toHaveValue('9876543210');
  fireEvent.change(phone, { target: { value: '+44 7700 900123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open WhatsApp Web' }));
  expect(open).toHaveBeenCalledTimes(1);
  const [url, target] = open.mock.calls[0];
  const chatUrl = new URL(url);
  expect(chatUrl.origin).toBe('https://web.whatsapp.com');
  expect(chatUrl.pathname).toBe('/send');
  expect(chatUrl.searchParams.get('phone')).toBe('447700900123');
  expect(chatUrl.searchParams.get('text')).toContain('SALE-A');
  expect(chatUrl.searchParams.get('text')).toContain('ANU');
  expect(target).toBe('_blank');
  expect(chat.opener).toBeNull();
  expect(screen.getByText('WhatsApp Web opened. Attach the downloaded bill PDF and click Send.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  expect(downloadBillPdf).not.toHaveBeenCalled();
});

test('reports a blocked WhatsApp Web popup without claiming the chat was opened', async () => {
  setupSampleBills();
  jest.spyOn(window, 'open').mockReturnValue(null);
  render(<SaleBillList />);
  await waitForBillActions();
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open WhatsApp Web' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please allow popups to open WhatsApp Web.');
  expect(screen.queryByText('WhatsApp Web opened. Attach the downloaded bill PDF and click Send.')).not.toBeInTheDocument();
});

test('downloads the selected sale with its shop and matched customer and shows the attachment instructions', async () => {
  setupSampleBills();
  render(<SaleBillList />);
  await waitForBillActions();
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(await screen.findByText('Downloaded Sale-Bill-BILL-1.pdf. Open WhatsApp Web, attach this PDF, then send.')).toBeInTheDocument();
  expect(downloadBillPdf).toHaveBeenCalledTimes(1);
  expect(downloadBillPdf).toHaveBeenCalledWith(sampleSales[0], invoiceShop, customerRecords[0]);
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
});

test('keeps the selected preview and provides retry after PDF creation fails', async () => {
  setupSampleBills();
  downloadBillPdf.mockRejectedValueOnce(new Error('PDF creation failed.'));
  render(<SaleBillList />);
  await waitForBillActions();
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('PDF creation failed.');
  expect(screen.getByRole('article', { name: 'Sale bill SALE-A' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await screen.findByText('Downloaded Sale-Bill-BILL-1.pdf. Open WhatsApp Web, attach this PDF, then send.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(downloadBillPdf).toHaveBeenCalledTimes(2);
});

test('blocks filters, pagination, selection, printing, and sharing while a PDF is being prepared', async () => {
  setupSampleBills(120);
  let finishPdf;
  downloadBillPdf.mockImplementationOnce(() => new Promise((resolve) => { finishPdf = resolve; }));
  render(<SaleBillList />);
  await waitForBillActions();
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  const numberOfRequests = fetchJson.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(downloadBillPdf).toHaveBeenCalledTimes(1));
  for (const label of ['Search', 'Start date', 'End date', 'Status', 'WhatsApp number']) {
    expect(screen.getByLabelText(label)).toBeDisabled();
  }
  for (const name of ['Refresh', 'Apply filters', 'Clear', 'First', 'Previous', 'Next', 'Last', 'Print bill', 'Open WhatsApp Web', 'View bill SALE-B', 'Print bill SALE-B', 'Preparing PDF…']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-B' }));
  fireEvent.click(pageButton('Next'));
  fireEvent.submit(screen.getByLabelText('Search').closest('form'));
  expect(fetchJson).toHaveBeenCalledTimes(numberOfRequests);
  expect(screen.getByRole('article', { name: 'Sale bill SALE-A' })).toBeInTheDocument();
  await act(async () => { finishPdf('Sale-Bill-SALE-A.pdf'); });
  expect(screen.getByRole('button', { name: 'View bill SALE-B' })).toBeEnabled();
  expect(pageButton('Next')).toBeEnabled();
  expect(screen.getByLabelText('Search')).toBeEnabled();
});

test('clears the preview and share controls when the selected bill leaves the current page', async () => {
  render(<SaleBillList />);
  await waitUntilLoaded();
  fireEvent.click(rowAction('View', 'BILL-1'));
  expect(screen.getByRole('article', { name: 'Sale bill BILL-1' })).toBeInTheDocument();
  fireEvent.click(pageButton('Next'));
  await waitUntilLoaded();
  expect(screen.getByText('Customer 51')).toBeInTheDocument();
  expect(screen.queryByRole('article', { name: 'Sale bill BILL-1' })).not.toBeInTheDocument();
  expect(screen.getByText('Select a sale bill to preview it.')).toBeInTheDocument();
  expect(screen.queryByLabelText('WhatsApp number')).not.toBeInTheDocument();
});

test('shows reference lookup failures without hiding bill browsing or saved balance snapshots', async () => {
  setupSampleBills();
  fetchJson.mockImplementation((url) => {
    if (url === '/api/customers') return Promise.reject(new Error('Customers unavailable.'));
    if (url === '/api/invoice-settings/active') return Promise.reject(new Error('Invoice settings unavailable.'));
    return respondToSales(url);
  });
  render(<SaleBillList />);
  await waitForBillActions();
  expect(screen.getByRole('status')).toHaveTextContent('Customer details: Customers unavailable. Invoice header: Invoice settings unavailable. Use Refresh to retry.');
  fireEvent.click(screen.getByRole('button', { name: 'View bill SALE-A' }));
  const preview = screen.getByRole('article', { name: 'Sale bill SALE-A' });
  expect(within(preview).getByText('Opening balance', { selector: 'dt' }).nextElementSibling).toHaveTextContent('₹100.00');
  expect(screen.getByLabelText('WhatsApp number')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
});
