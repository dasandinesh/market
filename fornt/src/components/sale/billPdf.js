import { BILL_STYLE, renderBillHtml } from './billTemplate';

const PRINT_WIDTH_MM = 132;
const PRINT_HEIGHT_MM = 193;
const PRINT_MARGIN_MM = 8;
const cssPixels = (mm) => Math.ceil(mm * 96 / 25.4);

const filenameFor = (sale) => {
  const number = sale.bill_details?.order_sno || sale._id || 'Bill';
  const safeNumber = String(number).trim().replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').replace(/[. ]+$/g, '').slice(0, 100);
  return `Sale-Bill-${safeNumber || 'Bill'}.pdf`;
};

const loadBillDocument = (iframe, html) => new Promise((resolve, reject) => {
  const cleanup = () => {
    clearTimeout(timeout);
    iframe.removeEventListener('load', onLoad);
    iframe.removeEventListener('error', onError);
  };
  const onLoad = () => {
    cleanup();
    const frameDocument = iframe.contentDocument;
    if (!frameDocument?.querySelector('.bill-page')) {
      reject(new Error('The bill could not be prepared for PDF download.'));
      return;
    }
    resolve(frameDocument);
  };
  const onError = () => {
    cleanup();
    reject(new Error('The bill could not be prepared for PDF download.'));
  };
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error('Preparing the bill PDF timed out. Please try again.'));
  }, 15000);
  iframe.addEventListener('load', onLoad);
  iframe.addEventListener('error', onError);
  iframe.srcdoc = html;
  try {
    document.body.appendChild(iframe);
  } catch (error) {
    cleanup();
    reject(error);
  }
});

// Rasterize the existing printed pages so browser-shaped Tamil and other Unicode
// text retain their appearance without substituting PDF fonts or a second layout.
export async function downloadBillPdf(sale, shop = {}, customer = null) {
  if (!Array.isArray(sale?.products) || sale.products.length === 0) {
    throw new Error('This sale bill has no products to download.');
  }
  const billHtml = renderBillHtml(sale, shop, customer);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const iframe = document.createElement('iframe');
  iframe.title = 'Sale bill PDF renderer';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  // Keep a real layout viewport. display:none or a zero-sized frame cannot be
  // rendered reliably, and the separate document prevents app CSS leaking in.
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PRINT_WIDTH_MM}mm;height:${PRINT_HEIGHT_MM}mm;border:0;pointer-events:none;`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sale bill PDF</title>
    <style>${BILL_STYLE}
      html, body { width: ${PRINT_WIDTH_MM}mm; min-width: ${PRINT_WIDTH_MM}mm; max-width: ${PRINT_WIDTH_MM}mm; background: #fff; }
    </style></head><body>${billHtml}</body></html>`;

  try {
    const frameDocument = await loadBillDocument(iframe, html);
    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
    const pages = Array.from(frameDocument.querySelectorAll('.bill-page'));
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5', compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        scale: 2,
        backgroundColor: '#fff',
        logging: false,
        windowWidth: cssPixels(PRINT_WIDTH_MM),
        windowHeight: cssPixels(PRINT_HEIGHT_MM),
        scrollX: 0,
        scrollY: 0,
      });
      if (index > 0) pdf.addPage('a5', 'portrait');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', PRINT_MARGIN_MM, PRINT_MARGIN_MM,
        PRINT_WIDTH_MM, PRINT_HEIGHT_MM, `bill-page-${index}`, 'FAST');
    }
    const filename = filenameFor(sale);
    await pdf.save(filename, { returnPromise: true });
    return filename;
  } finally {
    iframe.remove();
  }
}
