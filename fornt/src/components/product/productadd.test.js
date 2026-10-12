import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fetchJson } from '../../api';
import ProductAdd from './productadd';

jest.mock('../../api', () => ({ fetchJson: jest.fn() }));

beforeEach(() => {
  fetchJson.mockReset();
  fetchJson.mockImplementation((url, options) => Promise.resolve(
    url === '/api/units' ? (options?.method === 'POST' ? { name: 'Sack' } : [{ name: 'Kg' }]) : {}
  ));
});

afterEach(() => { jest.restoreAllMocks(); });

const fillProduct = () => {
  fireEvent.change(screen.getByLabelText(/Product name/), { target: { value: 'Rice' } });
  fireEvent.change(screen.getByLabelText(/Selling price/), { target: { value: '12.50' } });
};

test('saving a unit in the popup selects it without submitting or clearing the product', async () => {
  render(<ProductAdd />);
  await waitFor(() => expect(document.getElementById('product-unit-options').options).toHaveLength(1));
  fillProduct();
  fireEvent.click(screen.getByRole('button', { name: 'Add unit' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog.closest('.customer-form')).toBeNull();
  fireEvent.change(within(dialog).getByLabelText(/Unit name/), { target: { value: 'Sack' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save unit' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  expect(fetchJson).toHaveBeenCalledWith('/api/units', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Sack' }) }));
  expect(fetchJson.mock.calls.filter(([url]) => url === '/api/products')).toHaveLength(0);
  expect(screen.getByLabelText('Unit')).toHaveValue('Sack');
  expect(screen.getByLabelText(/Product name/)).toHaveValue('Rice');
  expect(screen.getByLabelText(/Selling price/)).toHaveValue(12.5);

  fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
  await screen.findByText('Product saved successfully.');
  const productRequest = fetchJson.mock.calls.find(([url]) => url === '/api/products');
  expect(JSON.parse(productRequest[1].body)).toEqual(expect.objectContaining({ name: 'Rice', unit: 'Sack', price: 12.5 }));
  expect(screen.getByLabelText('Unit')).toHaveValue('');
  expect(document.getElementById('product-unit-options').options).toHaveLength(2);
});

test('an existing autocomplete unit is included in the saved product', async () => {
  render(<ProductAdd />);
  await waitFor(() => expect(document.getElementById('product-unit-options').options).toHaveLength(1));
  expect(screen.getByLabelText('Unit')).toHaveAttribute('list', 'product-unit-options');
  expect(document.getElementById('product-unit-options').options[0].value).toBe('Kg');
  fillProduct();
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'Kg' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
  await screen.findByText('Product saved successfully.');
  const productRequest = fetchJson.mock.calls.find(([url]) => url === '/api/products');
  expect(JSON.parse(productRequest[1].body).unit).toBe('Kg');
  expect(fetchJson.mock.calls.filter(([url, options]) => url === '/api/units' && options?.method === 'POST')).toHaveLength(0);
});

test('deleting a unit removes the suggestion while preserving the product draft', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fetchJson.mockImplementation((url, options) => Promise.resolve(
    options?.method === 'DELETE' ? { name: 'Kg', message: 'Unit deleted.' } :
      url === '/api/units' ? [{ name: 'Kg' }] : {}
  ));
  render(<ProductAdd />);
  await waitFor(() => expect(document.getElementById('product-unit-options').options).toHaveLength(1));
  fillProduct();
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'Kg' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add unit' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete unit Kg' }));
  await waitFor(() => expect(document.getElementById('product-unit-options').options).toHaveLength(0));

  expect(fetchJson).toHaveBeenCalledWith('/api/units?name=Kg', { method: 'DELETE' });
  expect(screen.getByLabelText('Unit')).toHaveValue('Kg');
  expect(screen.getByLabelText(/Product name/)).toHaveValue('Rice');
  expect(fetchJson.mock.calls.filter(([url]) => url === '/api/products')).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
  await screen.findByText('Product saved successfully.');
  const productRequest = fetchJson.mock.calls.find(([url]) => url === '/api/products');
  expect(JSON.parse(productRequest[1].body)).toEqual(expect.objectContaining({ name: 'Rice', unit: 'Kg', price: 12.5 }));
});

