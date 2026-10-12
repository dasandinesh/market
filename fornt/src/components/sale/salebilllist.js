import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../api';
import { LIST_PAGE_SIZE } from '../../pagination';
import Pagination from '../common/Pagination';
import SaleBillPreview from './SaleBillPreview';
import { renderBillHtml, buildBillsDocumentHtml } from './billTemplate';
import { buildWhatsAppMessage, buildWhatsAppWebUrl } from './billShare';
import '../../components/cutomer/customerlist.css';
import './salebilllist.css';

const currency = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const emptyFilters = { q: '', startDate: '', endDate: '', billed: '' };

// Report-style browse of every sale bill: free-text search (customer or bill no.),
// date range, billed/pending status, and server-side pagination.
const SaleBillList = () => {
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [shop, setShop] = useState({});
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsMessage, setDetailsMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const requestId = useRef(0);
  const detailsRequestId = useRef(0);
  const mounted = useRef(false);
  const downloadInProgress = useRef(false);

  const loadBillDetails = useCallback(async () => {
    const request = ++detailsRequestId.current;
    setDetailsLoading(true);
    const results = await Promise.allSettled([
      fetchJson('/api/customers'),
      fetchJson('/api/invoice-settings/active'),
    ]);
    if (request !== detailsRequestId.current) return;
    setCustomers(results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : []);
    setShop(results[1].status === 'fulfilled' ? results[1].value || {} : {});
    const errors = [];
    if (results[0].status === 'rejected') errors.push(`Customer details: ${results[0].reason.message}`);
    if (results[1].status === 'rejected') errors.push(`Invoice header: ${results[1].reason.message}`);
    setDetailsMessage(errors.join(' '));
    setDetailsLoading(false);
  }, []);

  const loadSales = useCallback(async (activeFilters, activePage) => {
    const request = ++requestId.current;
    setLoading(true);
    setMessage('');
    setActionMessage('');
    setActionError('');
    setPage(activePage);
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('limit', LIST_PAGE_SIZE);
    try {
      let requestedPage = activePage;
      while (true) {
        params.set('page', requestedPage);
        const result = await fetchJson(`/api/sales?${params.toString()}`);
        if (request !== requestId.current) return;
        const nextTotal = Math.max(0, Number(result.total) || 0);
        const lastPage = Math.max(1, Math.ceil(nextTotal / LIST_PAGE_SIZE));
        // A refresh can remove the last page; fetch the new last page before
        // showing its data and totals together.
        if (requestedPage > lastPage) {
          requestedPage = lastPage;
          continue;
        }
        setSales(result.data || []);
        setTotal(nextTotal);
        setPage(requestedPage);
        break;
      }
    } catch (error) {
      if (request !== requestId.current) return;
      setSales([]);
      setTotal(0);
      setPage(1);
      setMessage(error.message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadSales(emptyFilters, 1);
    loadBillDetails();
    return () => {
      mounted.current = false;
      requestId.current += 1;
      detailsRequestId.current += 1;
    };
  }, [loadSales, loadBillDetails]);

  const selectedSale = sales.find((sale) => sale._id === selectedId) || null;
  const findCustomer = (sale) => customers.find((customer) =>
    customer.name?.trim().toLowerCase() === (sale?.customer?.name || '').trim().toLowerCase()
  ) || null;
  const selectedCustomer = findCustomer(selectedSale);
  const defaultPhone = selectedSale?.customer?.phone || selectedCustomer?.phone || '';

  useEffect(() => {
    setPhone(defaultPhone);
  }, [selectedId, defaultPhone]);

  // A selection only belongs to the currently displayed server page.
  useEffect(() => {
    if (selectedId && !sales.some((sale) => sale._id === selectedId)) setSelectedId('');
  }, [sales, selectedId]);

  const selectSale = (sale) => {
    setSelectedId(sale._id);
    setActionMessage('');
    setActionError('');
  };

  const printSale = (sale) => {
    selectSale(sale);
    try {
      const html = renderBillHtml(sale, shop, findCustomer(sale));
      if (!html) throw new Error('This bill has no products to print.');
      const printWindow = window.open('', '_blank', 'width=640,height=900');
      if (!printWindow) throw new Error('Please allow popups to print the bill.');
      // Bill numbers are user-entered, so use a fixed document title.
      printWindow.document.write(buildBillsDocumentHtml([html], 'Sale Bill'));
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const downloadPdf = async () => {
    if (!selectedSale || downloadInProgress.current) return;
    const sale = selectedSale;
    const customer = selectedCustomer;
    downloadInProgress.current = true;
    setDownloading(true);
    setActionMessage('');
    setActionError('');
    try {
      // Load the PDF tools only when a bill is downloaded.
      const { downloadBillPdf } = await import('./billPdf');
      const filename = await downloadBillPdf(sale, shop, customer);
      if (mounted.current) setActionMessage(`Downloaded ${filename}. Open WhatsApp Web, attach this PDF, then send.`);
    } catch (error) {
      if (mounted.current) setActionError(error.message || 'Unable to download the bill PDF. Please try again.');
    } finally {
      downloadInProgress.current = false;
      if (mounted.current) setDownloading(false);
    }
  };

  const openWhatsApp = (sale = selectedSale, recipientPhone = phone) => {
    if (!sale) return;
    setActionMessage('');
    setActionError('');
    try {
      const url = buildWhatsAppWebUrl(recipientPhone, buildWhatsAppMessage(sale, shop, findCustomer(sale)));
      const chat = window.open(url, '_blank');
      if (!chat) throw new Error('Please allow popups to open WhatsApp Web.');
      chat.opener = null;
      setActionMessage('WhatsApp Web opened. Attach the downloaded bill PDF and click Send.');
    } catch (error) {
      setActionError(error.message);
    }
  };

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const submitFilter = (event) => {
    event.preventDefault();
    if (loading || downloading) return;
    setAppliedFilters(filters);
    loadSales(filters, 1);
  };

  const clear = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    loadSales(emptyFilters, 1);
  };

  const goToPage = (target) => {
    const lastPage = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
    const next = Math.min(Math.max(1, target), lastPage);
    if (loading || downloading || next === page) return;
    loadSales(appliedFilters, next);
  };

  const pageTotal = sales.reduce((sum, sale) => sum + Number(sale.bill_details?.bill_amount || 0), 0);

  return (
    <main className="customer-list-page sale-bill-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <h2>Sale Bills</h2>
          </div>
          <button type="button" className="refresh-button" onClick={() => { loadSales(appliedFilters, page); loadBillDetails(); }} disabled={loading || downloading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="customer-message error" role="alert">{message}</p>}

        <form className="customer-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Customer or bill no." disabled={downloading} />
          </label>
          <label><span>Start date</span>
            <input type="date" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} disabled={downloading} />
          </label>
          <label><span>End date</span>
            <input type="date" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} disabled={downloading} />
          </label>
          <label><span>Status</span>
            <select value={filters.billed} onChange={(e) => update('billed', e.target.value)} disabled={downloading}>
              <option value="">All</option>
              <option value="true">Billed</option>
              <option value="false">Pending</option>
            </select>
          </label>
          <button type="submit" disabled={loading || downloading}>Apply filters</button>
          <button type="button" onClick={clear} disabled={loading || downloading}>Clear</button>
        </form>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Bill no.</th><th>Date</th><th>Customer</th><th>Quantity</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="customer-table-state">Loading sales…</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan="7" className="customer-table-state">No sale bills match this filter.</td></tr>
              ) : sales.map((sale) => (
                <tr key={sale._id} className={sale._id === selectedId ? 'sale-bill-selected' : undefined}>
                  <td>{sale.bill_details?.order_sno || '—'}</td>
                  <td>{displayDate(sale.bill_details?.date)}</td>
                  <td className="customer-name">{sale.customer?.name || '—'}</td>
                  <td>{sale.bill_details?.total_quantity || 0}</td>
                  <td>{currency(sale.bill_details?.bill_amount)}</td>
                  <td>{sale.bill_details?.billed ? 'Billed' : 'Pending'}</td>
                  <td>
                    <div className="sale-bill-row-actions">
                      <button type="button" className="sale-bill-whatsapp-button" onClick={() => {
                        const recipientPhone = sale._id === selectedId ? phone : sale.customer?.phone || findCustomer(sale)?.phone || '';
                        selectSale(sale);
                        openWhatsApp(sale, recipientPhone);
                      }} aria-label={`Send bill ${sale.bill_details?.order_sno || sale._id} on WhatsApp`} disabled={detailsLoading || downloading}>WhatsApp Send</button>
                      <button type="button" onClick={() => selectSale(sale)} aria-label={`View bill ${sale.bill_details?.order_sno || sale._id}`} aria-pressed={sale._id === selectedId} disabled={downloading}>View</button>
                      <button type="button" onClick={() => printSale(sale)} aria-label={`Print bill ${sale.bill_details?.order_sno || sale._id}`} disabled={detailsLoading || downloading}>Print</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && sales.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="4" className="sale-bill-list-total-label">This page's total</td>
                  <td className="sale-bill-list-total-value">{currency(pageTotal)}</td>
                  <td colSpan="2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <Pagination page={page} total={total} onPageChange={goToPage} loading={loading || downloading} itemLabel={total === 1 ? 'bill' : 'bills'} />
      </section>
      <aside className="sale-bill-preview-panel" aria-label="Selected sale bill">
        <header className="sale-bill-preview-heading"><h2>Bill preview</h2></header>
        {detailsMessage && <p className="sale-bill-notice" role="status">{detailsMessage} Use Refresh to retry.</p>}
        <SaleBillPreview sale={selectedSale} shop={shop} customer={selectedCustomer} />
        {selectedSale && (
          <div className="sale-bill-share">
            <div className="sale-bill-preview-actions">
              <button type="button" onClick={() => printSale(selectedSale)} disabled={loading || detailsLoading || downloading}>Print bill</button>
              <button type="button" onClick={downloadPdf} disabled={loading || detailsLoading || downloading}>{downloading ? 'Preparing PDF…' : 'Download PDF'}</button>
            </div>
            <label htmlFor="sale-bill-whatsapp-phone">WhatsApp number</label>
            <input id="sale-bill-whatsapp-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit mobile or +country code" disabled={detailsLoading || downloading} />
            <button type="button" className="sale-bill-whatsapp-button" onClick={() => openWhatsApp()} disabled={loading || detailsLoading || downloading}>Open WhatsApp Web</button>
            <p>Download the PDF, open WhatsApp Web, then attach the file using Document and click Send.</p>
          </div>
        )}
        {actionError && <p className="customer-message error" role="alert">{actionError}</p>}
        {actionMessage && <p className="sale-bill-notice" role="status">{actionMessage}</p>}
      </aside>
    </main>
  );
};

export default SaleBillList;
