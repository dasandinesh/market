// The printable bill template — letterhead, item table, totals — written as plain
// React components. `renderBillHtml` turns one bill into an HTML string and
// `buildBillsDocumentHtml` wraps one or more bills into a full print document
// (each bill starts on a new A5 page; long bills continue over several pages with
// the letterhead repeated).
//
// To change how a bill looks: edit the components below and/or `BILL_STYLE`.
// Nothing else in the app needs to change.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------- helpers ----------

const toDateInput = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
    return parsed.toISOString().split('T')[0];
};

const money = (n) => Number(n || 0).toFixed(2);
const has = (v) => v !== undefined && v !== null && v !== '';

// How many table rows physically fit on one A5 page between the letterhead and the
// footer. Full pages use every row (products + the "Continued" line) so there is no
// empty gap; the last page keeps room for the totals block. Lower it if rows spill
// onto an extra sheet; raise it if full pages still show a gap.
const ROWS_PER_PAGE = 23;
const ITEMS_PER_PAGE = ROWS_PER_PAGE - 1; // one row goes to "Continued on next page…"

// Split items into pages. Every page except the last is filled completely; the last
// page takes what is left plus the totals block. If the leftovers plus totals would
// not fit, they all go on the full page and the totals get a page of their own.
const paginate = (items, totalsRows) => {
    const lastPageCap = Math.max(0, Math.min(ITEMS_PER_PAGE, ROWS_PER_PAGE - totalsRows));
    const pages = [];
    let i = 0;
    while (items.length - i > lastPageCap) {
        pages.push(items.slice(i, i + ITEMS_PER_PAGE));
        i += ITEMS_PER_PAGE;
    }
    pages.push(items.slice(i));
    return pages;
};

// ---------- components ----------

// Shared by the item table and the totals table so their columns line up.
const Columns = () => (
    <colgroup>
        <col style={{ width: '9%' }} />
        <col style={{ width: '14%' }} />
        <col />
        <col style={{ width: '13%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '17%' }} />
    </colgroup>
);

const Letterhead = ({ shop, customerName, bill }) => {
    const address = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode]
        .filter(Boolean)
        .join(', ');
    const phones = [shop.phone, shop.phone_2].filter(Boolean);

    return (
        <thead>
            <tr>
                <td colSpan={6} className="shop">
                    <div className="shop-top">
                        <div>
                            <div className="shop-name">{shop.name}</div>
                            <div className="shop-area">{shop.area}</div>
                        </div>
                        <div className="shop-cell">
                            {phones.map((phone) => <div key={phone}>Cell : {phone}</div>)}
                        </div>
                    </div>
                    {address && <div className="shop-addr">{address}</div>}
                </td>
            </tr>
            <tr>
                <td colSpan={6} className="meta">
                    <div className="meta-row">
                        <div>To: <b>{customerName}</b></div>
                        <div>
                            Dt: <b>{toDateInput(bill.date)}</b>
                            {'   '}No: <b>{bill.order_sno}</b>
                        </div>
                    </div>
                </td>
            </tr>
            <tr className="cols">
                <th>SNo</th><th>Rate</th><th>Item</th><th>Kgs</th><th>Bag</th><th>Amount</th>
            </tr>
        </thead>
    );
};

const ProductRow = ({ item, sno }) => (
    <tr>
        <td className="c">{sno}</td>
        <td className="r">{money(item.single_price)}</td>
        <td className="item">{item.name}</td>
        <td className="r">{item.quantity ? money(item.quantity) : ''}</td>
        <td className="r">{item.bags || ''}</td>
        <td className="r">{money(item.base_price)}</td>
    </tr>
);

// One "label ... amount" line under the Total row.
//   bold      — label and amount in bold
//   boldLabel — only the label in bold
const AmountRow = ({ label, value, bold, boldLabel }) => (
    <tr>
        <td colSpan={2} />
        <td colSpan={3} className={bold || boldLabel ? 'r lbl' : 'r'}>{label}</td>
        <td className={bold ? 'r lbl' : 'r'}>{money(value)}</td>
    </tr>
);

const Totals = ({ totalKgs, totalBags, subtotal, amountRows }) => (
    <table className="totals">
        <Columns />
        <tbody>
            <tr>
                <td colSpan={2} />
                <td className="lbl">Total</td>
                <td className="r lbl">{money(totalKgs)}</td>
                <td className="r lbl">{totalBags}</td>
                <td className="r lbl">{money(subtotal)}</td>
            </tr>
            {amountRows.map((row) => <AmountRow key={row.label} {...row} />)}
        </tbody>
    </table>
);

// One printed A5 sheet.
const BillPage = ({ shop, customerName, bill, items, firstSno, isLast, pageNo, pageCount, totals }) => (
    <section className="bill-page">
        {shop.header && <div className="quote">{shop.header}</div>}

        <div className="items-wrap">
            <table className="items">
                <Columns />
                <Letterhead shop={shop} customerName={customerName} bill={bill} />
                <tbody>
                    {items.map((item, i) => <ProductRow key={i} item={item} sno={firstSno + i} />)}
                    {isLast ? (
                        // Empty row that stretches, carrying the column lines down to the totals.
                        <tr className="filler"><td /><td /><td /><td /><td /><td /></tr>
                    ) : (
                        <tr><td colSpan={6} className="r cont">Continued on next page…</td></tr>
                    )}
                </tbody>
            </table>
        </div>

        <div className="bill-bottom">
            {isLast && <Totals {...totals} />}
            <footer className="bill-footer">
                {shop.fooder && <div className="foot-note">{shop.fooder}</div>}
                <div className="page-no">Bill {bill.order_sno} · Page {pageNo} of {pageCount}</div>
            </footer>
        </div>
    </section>
);

// A whole bill — works for a sale record or an order (purchase) record, since both
// share the same bill_details / products shape.
//   record   — the sale/order document
//   shop     — the active invoice setting (letterhead), or {}
//   customer — the matching customer record, for the live balance fallback, or null
const Bill = ({ record, shop, customer }) => {
    const bill = record.bill_details || {};
    const items = record.products || [];

    const billTotal = Number(bill.bill_amount || 0);
    const paid = Number(bill.debit || 0) + Number(bill.credit || 0);
    // Prefer the balance snapshot saved with the bill; fall back to the customer's live balance.
    const openingBalance = has(bill.old_balance) ? Number(bill.old_balance) : Number(customer?.oldBalance ?? 0);
    const closingBalance = has(bill.net_balance) ? Number(bill.net_balance) : openingBalance + billTotal - paid;

    // Charges only print when they are non-zero.
    const amountRows = [
        { label: 'Bag Amount', value: Number(bill.bagAmountTotal || 0), boldLabel: true },
        { label: 'Cooly', value: Number(bill.wageTotal || 0), boldLabel: true },
        { label: 'Commission', value: Number(bill.commissionTotal || 0), boldLabel: true },
        { label: 'Freight', value: Number(bill.freight || bill.transport || 0), boldLabel: true },
    ].filter((row) => row.value);
    amountRows.push({ label: 'BILL TOTAL', value: billTotal, bold: true });
    if (paid) amountRows.push({ label: 'Paid', value: paid });
    amountRows.push({ label: 'Opening Balance', value: openingBalance });
    amountRows.push({ label: 'Closing Balance', value: closingBalance, bold: true });

    const totals = {
        totalKgs: items.reduce((t, p) => t + Number(p.quantity || 0), 0),
        totalBags: items.reduce((t, p) => t + Number(p.bags || 0), 0),
        subtotal: bill.subtotal,
        amountRows,
    };

    const pages = paginate(items, amountRows.length + 1); // +1 for the Total row
    let firstSno = 1;

    return pages.map((pageItems, index) => {
        const page = (
            <BillPage
                key={index}
                shop={shop}
                customerName={record.customer?.name}
                bill={bill}
                items={pageItems}
                firstSno={firstSno}
                isLast={index === pages.length - 1}
                pageNo={index + 1}
                pageCount={pages.length}
                totals={totals}
            />
        );
        firstSno += pageItems.length;
        return page;
    });
};

// ---------- exports used by Sale Entry ----------

// One bill as an HTML string ('' when it has no products).
export const renderBillHtml = (record, shop = {}, customer = null) => {
    if (!record.products?.length) return '';
    return renderToStaticMarkup(<Bill record={record} shop={shop || {}} customer={customer} />);
};

// Print-window CSS for the bill template — edit this to restyle every printed bill
// (fonts, spacing, letterhead layout, page size).
export const BILL_STYLE = `
    @page { size: A5; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; }
    /* One sheet: fixed to the A5 printable height (210mm - 2 x 8mm margin) so the
       footer can sit at the bottom. Slightly under 194mm to avoid a blank spill page. */
    .bill-page {
        height: 193mm;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #000; /* full border round the whole bill */
        page-break-after: always;
        break-after: page;
    }
    .bill-page:last-child { page-break-after: auto; break-after: auto; }
    .quote { text-align: center; font-style: italic; padding: 3px; border-bottom: 1px solid #000; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    /* The page draws the outer border, so hide the tables' own outer edges (no double lines). */
    table.items, table.totals { border-style: hidden; }
    /* Item table grows to fill the sheet; the empty filler row carries the column
       lines down to the totals. */
    .items-wrap { flex: 1 1 auto; min-height: 0; }
    table.items { height: 100%; }
    /* Product rows: only the vertical column lines, no line between products. */
    table.items tbody td { border-top: 0; border-bottom: 0; }
    .filler td { height: 100%; }
    .item { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    table.items tbody td.cont { font-style: italic; font-size: 11px; border-top: 1px solid #000; }
    /* Totals + footer at the bottom of the sheet. */
    .bill-bottom { border-top: 1px solid #000; }
    .bill-footer { padding: 4px 6px; border-top: 1px solid #000; }
    .page-no { text-align: right; font-size: 10px; margin-top: 2px; }
    thead td, thead th, tbody td { border: 1px solid #000; }
    .shop { padding: 6px 8px; }
    .shop-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .shop-name { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: bold; line-height: 1; }
    .shop-area { font-weight: bold; margin-top: 3px; }
    .shop-cell { text-align: right; font-weight: bold; font-size: 11px; }
    .shop-addr { margin-top: 3px; font-size: 11px; }
    .meta { padding: 4px 8px; }
    .meta-row { display: flex; justify-content: space-between; }
    thead .cols th { background: #f0f0f0; padding: 3px 6px; }
    tbody td { padding: 2px 6px; }
    .c { text-align: center; }
    .r { text-align: right; white-space: nowrap; }
    .lbl { font-weight: bold; }
    .foot-note { text-align: center; font-style: italic; font-size: 11px; }
`;

// Wraps one or more bills' HTML into a full print document, each bill on its own A5 page(s),
// auto-printing once the window has loaded.
export const buildBillsDocumentHtml = (billsHtml, title = 'Bills') => `
    <html>
    <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>${BILL_STYLE}</style>
    </head>
    <body>
        ${billsHtml.join('')}
        <script>window.onload = function () { window.print(); }</script>
    </body>
    </html>
`;
