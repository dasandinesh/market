import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fetchJson } from '../../api';
import CustomerList from '../cutomer/customerlist';
import ProductList from '../product/productlist';
import DriverList from '../driver/driverlist';
import VehicleList from '../vehicle/vehiclelist';
import Pagination from './Pagination';

jest.mock('../../api');
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));

const records = (count) => Array.from({ length: count }, (_, index) => ({
  _id: `record-${index + 1}`,
  name: `Record ${String(index + 1).padStart(3, '0')}`,
}));

const masterLists = [
  ['customers', CustomerList, '/api/customers', 'Name'],
  ['products', ProductList, '/api/products', 'Search products'],
  ['drivers', DriverList, '/api/drivers', 'Name'],
  ['vehicles', VehicleList, '/api/vehicles', 'Name'],
];

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.restoreAllMocks(); });

test.each(masterLists)('%s paginate by 50 and reset to the first page when searching', async (label, Component, endpoint, searchLabel) => {
  fetchJson.mockResolvedValue(records(101));
  render(<Component />);
  await screen.findByText('Record 001');

  expect(fetchJson).toHaveBeenCalledWith(endpoint);
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(51);
  expect(screen.queryByText('Record 051')).not.toBeInTheDocument();
  expect(screen.getByText(`Showing 1–50 of 101 ${label}`)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Record 051')).toBeInTheDocument();
  expect(screen.getByText('Record 100')).toBeInTheDocument();
  expect(screen.queryByText('Record 001')).not.toBeInTheDocument();
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Last' }));
  expect(screen.getByText('Record 101')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText(`Showing 101–101 of 101 ${label}`)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  fireEvent.change(screen.getByRole('searchbox', { name: searchLabel }), { target: { value: 'Record 0' } });
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByText('Record 001')).toBeInTheDocument();
  expect(screen.getByText(`Showing 1–50 of 99 ${label}`)).toBeInTheDocument();
});

test.each(masterLists)('%s return to a valid page after deleting the last row', async (label, Component, endpoint) => {
  fetchJson.mockImplementation((url, options) => Promise.resolve(options?.method === 'DELETE' ? {} : records(101)));
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<Component />);
  await screen.findByText('Record 001');

  fireEvent.click(screen.getByRole('button', { name: 'Last' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
  expect(fetchJson).toHaveBeenCalledWith(`${endpoint}/record-101`, { method: 'DELETE' });
  expect(screen.getByText('Record 051')).toBeInTheDocument();
  expect(screen.queryByText('Record 101')).not.toBeInTheDocument();
  expect(screen.getByText(`Showing 51–100 of 100 ${label}`)).toBeInTheDocument();
});

test.each([0, 1, 50])('a product list with %i records has one page and no next page', async (count) => {
  fetchJson.mockResolvedValue(records(count));
  render(<ProductList />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  expect(screen.getByText(`Showing ${count ? 1 : 0}–${count} of ${count} products`)).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();
});

test('pagination blocks navigation while a page is loading', () => {
  const onPageChange = jest.fn();
  render(<Pagination page={2} total={151} onPageChange={onPageChange} loading />);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(onPageChange).not.toHaveBeenCalled();
});
