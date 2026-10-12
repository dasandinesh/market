import React from 'react';
import { render, screen, within } from '@testing-library/react';
import SaleBillPreview from './SaleBillPreview';

const valueOf = (label) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

test('prompts for a selected bill without rendering a duplicate heading or item table', () => {
  render(<SaleBillPreview sale={null} />);
  expect(screen.getByText('Select a sale bill to preview it.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Bill preview' })).not.toBeInTheDocument();
});

test('shows item amounts, nonzero charges, and saved balance snapshots consistently with printed bills', () => {
  render(<SaleBillPreview
    sale={{
      customer: { name: 'Anu' },
      products: [{ _id: 'item-1', name: 'Mango', quantity: 5, bags: 2, single_price: 10, base_price: 50 }],
      bill_details: { order_sno: 'BILL-8', date: '2026-10-10', subtotal: 50, bagAmountTotal: 5, wageTotal: 0, commissionTotal: 2, transport: 3, bill_amount: 60, debit: 4, credit: 6, old_balance: 100, net_balance: 150 },
    }}
    shop={{ name: 'Market Shop', area: 'Town', phone: '12345' }}
    customer={{ name: 'Current customer name', oldBalance: 999 }}
  />);
  expect(screen.getByRole('article', { name: 'Sale bill BILL-8' })).toBeInTheDocument();
  expect(screen.getByText('Market Shop')).toBeInTheDocument();
  expect(valueOf('Customer')).toHaveTextContent('Anu');
  expect(valueOf('Bill no.')).toHaveTextContent('BILL-8');
  expect(valueOf('Date')).toHaveTextContent('2026');
  const row = within(screen.getByRole('table', { name: 'Bill items' })).getAllByRole('row')[1];
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Mango', '5', '₹10.00', '2', '₹50.00']);
  expect(valueOf('Subtotal')).toHaveTextContent('₹50.00');
  expect(valueOf('Bag amount')).toHaveTextContent('₹5.00');
  expect(valueOf('Commission')).toHaveTextContent('₹2.00');
  expect(valueOf('Freight')).toHaveTextContent('₹3.00');
  expect(screen.queryByText('Cooly')).not.toBeInTheDocument();
  expect(valueOf('Bill total')).toHaveTextContent('₹60.00');
  expect(valueOf('Paid')).toHaveTextContent('₹10.00');
  expect(valueOf('Opening balance')).toHaveTextContent('₹100.00');
  expect(valueOf('Closing balance')).toHaveTextContent('₹150.00');
});

test('retains zero snapshots instead of substituting the current customer balance', () => {
  render(<SaleBillPreview sale={{ bill_details: { old_balance: 0, net_balance: '0', bill_amount: 50 } }} customer={{ oldBalance: 900 }} />);
  expect(valueOf('Opening balance')).toHaveTextContent('₹0.00');
  expect(valueOf('Closing balance')).toHaveTextContent('₹0.00');
  expect(valueOf('Paid')).toHaveTextContent('₹0.00');
});

test('falls back to the customer balance and computes closing balance when snapshots are absent', () => {
  render(<SaleBillPreview sale={{ bill_details: { old_balance: '', net_balance: null, bill_amount: 50, debit: 8, credit: 2 } }} customer={{ name: 'Fallback customer', oldBalance: 100 }} />);
  expect(valueOf('Customer')).toHaveTextContent('Fallback customer');
  expect(valueOf('Opening balance')).toHaveTextContent('₹100.00');
  expect(valueOf('Closing balance')).toHaveTextContent('₹140.00');
  expect(screen.getByText('No items in this bill.')).toBeInTheDocument();
});
