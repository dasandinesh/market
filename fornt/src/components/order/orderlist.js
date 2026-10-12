import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../api';
import { useListPagination } from '../../pagination';
import Pagination from '../common/Pagination';
import '../../components/cutomer/customerlist.css';

const currency = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => value ? new Date(value).toLocaleDateString() : '—';
const emptyFilters = { customer: '', startDate: '', endDate: '' };

const OrderList = () => {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [activeFilters, setActiveFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);
  const { pageItems, page, setPage } = useListPagination(orders, JSON.stringify(activeFilters));

  const loadOrders = useCallback(async (requestFilters) => {
    const request = ++requestId.current;
    setPage(1);
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(requestFilters).forEach(([key, value]) => value && params.set(key, value));
    try {
      const data = await fetchJson(`/api/orders${params.toString() ? `?${params}` : ''}`);
      if (request !== requestId.current) return;
      setOrders(data);
    } catch (error) {
      if (request !== requestId.current) return;
      setOrders([]);
      setMessage(error.message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [setPage]);

  useEffect(() => {
    loadOrders(activeFilters);
    return () => { requestId.current += 1; };
  }, [activeFilters, loadOrders]);

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const submitFilter = (event) => {
    event.preventDefault();
    if (loading) return;
    setActiveFilters({ ...filters });
  };
  const clear = () => {
    if (loading) return;
    setFilters({ ...emptyFilters });
    setActiveFilters({ ...emptyFilters });
  };

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Order management</p>
            <h1>Orders</h1>
            <p>Filter orders by customer or billing date.</p>
          </div>
          <button type="button" className="refresh-button" onClick={() => loadOrders(activeFilters)} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>
        {message && <p className="customer-message error" role="alert">{message}</p>}
        <form className="customer-filter" onSubmit={submitFilter}>
          <label>
            <span>Customer name</span>
            <input type="search" value={filters.customer} onChange={(event) => update('customer', event.target.value)} placeholder="Search customer" />
          </label>
          <label>
            <span>Start date</span>
            <input type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} />
          </label>
          <label>
            <span>End date</span>
            <input type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} />
          </label>
          <button type="submit" disabled={loading}>Apply filters</button>
          <button type="button" onClick={clear} disabled={loading}>Clear</button>
        </form>
        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead><tr><th>Bill no.</th><th>Date</th><th>Customer</th><th>Products</th><th>Quantity</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="customer-table-state">Loading orders…</td></tr> : orders.length === 0 ? <tr><td colSpan="7" className="customer-table-state">No orders match this filter.</td></tr> : pageItems.map((order) => (
                <tr key={order._id}>
                  <td>{order.bill_details?.order_sno || '—'}</td>
                  <td>{displayDate(order.bill_details?.date)}</td>
                  <td className="customer-name">{order.customer?.name}</td>
                  <td>{order.products?.map((product) => product.name).join(', ') || '—'}</td>
                  <td>{order.bill_details?.total_quantity || 0}</td>
                  <td>{currency(order.bill_details?.bill_amount)}</td>
                  <td>{order.bill_details?.billed ? 'Billed' : 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={orders.length} onPageChange={setPage} loading={loading} itemLabel="orders" />
      </section>
    </main>
  );
};

export default OrderList;
