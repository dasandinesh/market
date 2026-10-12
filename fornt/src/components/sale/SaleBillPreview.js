import React from 'react';
import './SaleBillPreview.css';

const amount = (value) => Number(value || 0);
const currency = (value) => `₹${amount(value).toFixed(2)}`;
const hasValue = (value) => value !== undefined && value !== null && value !== '';
const quantity = (value) => amount(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const displayDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function SaleBillPreview({ sale, shop, customer }) {
  if (!sale) return <p className="sale-bill-preview-empty">Select a sale bill to preview it.</p>;

  const bill = sale.bill_details || {};
  const items = sale.products || [];
  const invoiceShop = shop || {};
  const billNumber = bill.order_sno || '—';
  const customerName = sale.customer?.name || customer?.name || '—';
  const shopAddress = [invoiceShop.door, invoiceShop.street, invoiceShop.area, invoiceShop.district, invoiceShop.state, invoiceShop.pincode].filter(Boolean).join(', ');
  const phones = [invoiceShop.phone, invoiceShop.phone_2].filter(Boolean).join(' / ');
  const billTotal = amount(bill.bill_amount);
  const paid = amount(bill.debit) + amount(bill.credit);
  // Keep the preview's balances consistent with the printable bill.
  const openingBalance = hasValue(bill.old_balance) ? amount(bill.old_balance) : amount(customer?.oldBalance);
  const closingBalance = hasValue(bill.net_balance) ? amount(bill.net_balance) : openingBalance + billTotal - paid;
  const charges = [
    { label: 'Bag amount', value: amount(bill.bagAmountTotal) },
    { label: 'Cooly', value: amount(bill.wageTotal) },
    { label: 'Commission', value: amount(bill.commissionTotal) },
    { label: 'Freight', value: amount(bill.freight || bill.transport) },
  ].filter((charge) => charge.value !== 0);

  return (
    <article className="sale-bill-preview-document" aria-label={`Sale bill ${billNumber}`}>
      {(invoiceShop.name || shopAddress || phones) && (
        <div className="sale-bill-preview-shop">
          {invoiceShop.name && <p className="sale-bill-preview-shop-name">{invoiceShop.name}</p>}
          {shopAddress && <p>{shopAddress}</p>}
          {phones && <p>{phones}</p>}
        </div>
      )}

      <dl className="sale-bill-preview-meta">
        <div><dt>Bill no.</dt><dd>{billNumber}</dd></div>
        <div><dt>Date</dt><dd>{displayDate(bill.date)}</dd></div>
        <div className="sale-bill-preview-party"><dt>Customer</dt><dd>{customerName}</dd></div>
      </dl>

      <div className="sale-bill-preview-items-wrap">
        <table className="sale-bill-preview-items">
          <caption>Bill items</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Rate</th><th scope="col">Bags</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={5} className="sale-bill-preview-no-items">No items in this bill.</td></tr> : items.map((item, index) => (
              <tr key={item._id || index}>
                <td className="sale-bill-preview-item-name">{item.name || '—'}</td>
                <td>{quantity(item.quantity)}</td>
                <td>{currency(item.single_price)}</td>
                <td>{quantity(item.bags)}</td>
                <td>{currency(item.base_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="sale-bill-preview-quantities">
        <div><dt>Total quantity</dt><dd>{quantity(items.reduce((total, item) => total + amount(item.quantity), 0))}</dd></div>
        <div><dt>Total bags</dt><dd>{quantity(items.reduce((total, item) => total + amount(item.bags), 0))}</dd></div>
      </dl>

      <dl className="sale-bill-preview-totals">
        <div><dt>Subtotal</dt><dd>{currency(bill.subtotal)}</dd></div>
        {charges.map((charge) => <div key={charge.label}><dt>{charge.label}</dt><dd>{currency(charge.value)}</dd></div>)}
        <div className="sale-bill-preview-total"><dt>Bill total</dt><dd>{currency(billTotal)}</dd></div>
        <div><dt>Paid</dt><dd>{currency(paid)}</dd></div>
        <div><dt>Opening balance</dt><dd>{currency(openingBalance)}</dd></div>
        <div className="sale-bill-preview-closing"><dt>Closing balance</dt><dd>{currency(closingBalance)}</dd></div>
      </dl>
      {invoiceShop.fooder && <p className="sale-bill-preview-note">{invoiceShop.fooder}</p>}
    </article>
  );
}
