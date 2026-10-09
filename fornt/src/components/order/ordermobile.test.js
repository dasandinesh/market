import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import OrderEntryMobile from './ordermobile';

jest.mock('axios');

beforeEach(() => {
    axios.get.mockImplementation((url) => Promise.resolve({ data:
        url === '/api/customers' ? [{ _id: 'c1', name: 'Customer One' }] :
        url === '/api/products' ? [{ _id: 'p1', name: 'Product One', Price: 25, pags: 3, Wages: 2, commission: 1 }] : []
    }));
});

test('native datalist selections preserve customer value and product price', async () => {
    render(<OrderEntryMobile />);
    const customer = screen.getByLabelText('Customer name');
    const product = screen.getByLabelText('Product name');
    await waitFor(() => expect(document.getElementById('om-product-list').options).toHaveLength(1));
    expect(customer).toHaveAttribute('list', 'om-customer-list');
    expect(product).toHaveAttribute('list', 'om-product-list');
    expect(document.getElementById('om-customer-list').options[0].value).toBe('Customer One');
    customer.focus();
    fireEvent.change(customer, { target: { value: 'Customer One' } });
    expect(product).toHaveFocus();
    fireEvent.blur(customer);
    expect(customer).toHaveValue('Customer One');
    fireEvent.change(product, { target: { value: 'Product One' } });
    expect(screen.getByLabelText('Quantity')).toHaveFocus();
    expect(product).toHaveValue('Product One');
    expect(screen.getByLabelText('Single price')).toHaveValue(25);
});

test('unknown names still display validation warnings', async () => {
    render(<OrderEntryMobile />);
    await waitFor(() => expect(document.getElementById('om-product-list').options).toHaveLength(1));
    const customer = screen.getByLabelText('Customer name');
    customer.focus();
    fireEvent.change(customer, { target: { value: 'Unknown customer' } });
    expect(customer).toHaveFocus();
    fireEvent.blur(customer);
    expect(screen.getByText(/This customer is not in the list/)).toBeInTheDocument();
    const product = screen.getByLabelText('Product name');
    act(() => product.focus());
    fireEvent.change(product, { target: { value: 'Unknown product' } });
    expect(product).toHaveFocus();
    fireEvent.blur(product);
    expect(screen.getByText(/This product is not in the list/)).toBeInTheDocument();
});
