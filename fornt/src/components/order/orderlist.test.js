import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchJson } from '../../api';
import OrderList from './orderlist';

jest.mock('../../api', () => ({ fetchJson: jest.fn() }));

const makeOrders = (count, prefix = 'ORDER') => Array.from({ length: count }, (_, index) => ({
  _id: `${prefix}-${index + 1}`,
  customer: { name: `Customer ${index + 1}` },
  products: [{ name: 'Product One' }],
  bill_details: {
    order_sno: `${prefix}-${index + 1}`,
    date: '2026-10-01',
    total_quantity: 2,
    bill_amount: 100,
    billed: false,
  },
}));

const visibleOrderRows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => {
  fetchJson.mockReset();
});

test('orders display 50 records per page and navigation reaches the final partial page', async () => {
  fetchJson.mockResolvedValue(makeOrders(101));
  render(<OrderList />);

  await screen.findByText('ORDER-1');
  expect(visibleOrderRows()).toHaveLength(50);
  expect(screen.getByText('ORDER-50')).toBeInTheDocument();
  expect(screen.queryByText('ORDER-51')).not.toBeInTheDocument();
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(visibleOrderRows()).toHaveLength(50);
  expect(screen.getByText('ORDER-51')).toBeInTheDocument();
  expect(screen.getByText('ORDER-100')).toBeInTheDocument();
  expect(screen.queryByText('ORDER-1')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(visibleOrderRows()).toHaveLength(1);
  expect(screen.getByText('ORDER-101')).toBeInTheDocument();
  expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByText('ORDER-51')).toBeInTheDocument();
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  expect(fetchJson).toHaveBeenCalledTimes(1);
  expect(fetchJson).toHaveBeenCalledWith('/api/orders');
});

test('applying customer and date filters and clearing them returns to page one', async () => {
  fetchJson
    .mockResolvedValueOnce(makeOrders(101))
    .mockResolvedValueOnce(makeOrders(61, 'FILTERED'))
    .mockResolvedValueOnce(makeOrders(101));
  render(<OrderList />);
  await screen.findByText('ORDER-1');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Alice & Co' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-10' } });
  expect(fetchJson).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await screen.findByText('FILTERED-1');
  expect(fetchJson).toHaveBeenLastCalledWith('/api/orders?customer=Alice+%26+Co&startDate=2026-10-01&endDate=2026-10-10');
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(visibleOrderRows()).toHaveLength(50);

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('FILTERED-51')).toBeInTheDocument();
  expect(visibleOrderRows()).toHaveLength(11);
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await screen.findByText('ORDER-1');
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  expect(screen.getByLabelText('Customer name')).toHaveValue('');
  expect(screen.getByLabelText('Start date')).toHaveValue('');
  expect(screen.getByLabelText('End date')).toHaveValue('');
  expect(fetchJson).toHaveBeenLastCalledWith('/api/orders');
});

test('refresh uses the applied filters and resets pagination without applying draft edits', async () => {
  fetchJson
    .mockResolvedValueOnce(makeOrders(101))
    .mockResolvedValueOnce(makeOrders(101, 'FILTERED'))
    .mockResolvedValueOnce(makeOrders(51, 'REFRESHED'));
  render(<OrderList />);
  await screen.findByText('ORDER-1');
  fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Alice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await screen.findByText('FILTERED-1');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Unapplied edit' } });
  expect(fetchJson).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('REFRESHED-1');
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(3));
  expect(fetchJson).toHaveBeenLastCalledWith('/api/orders?customer=Alice');
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(visibleOrderRows()).toHaveLength(50);
  expect(screen.getByLabelText('Customer name')).toHaveValue('Unapplied edit');
});

test('a failed filter request clears prior records and disables controls while loading', async () => {
  let rejectRequest;
  fetchJson
    .mockResolvedValueOnce(makeOrders(101))
    .mockImplementationOnce(() => new Promise((resolve, reject) => { rejectRequest = reject; }));
  render(<OrderList />);
  await screen.findByText('ORDER-1');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('ORDER-51')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Alice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('button', { name: 'Apply filters' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

  await act(async () => { rejectRequest(new Error('Unable to load orders.')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load orders.');
  expect(screen.queryByText('ORDER-1')).not.toBeInTheDocument();
  expect(screen.queryByText('ORDER-51')).not.toBeInTheDocument();
  expect(screen.getByText('No orders match this filter.')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Apply filters' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
});
