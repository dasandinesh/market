import React from 'react';
import { LIST_PAGE_SIZE } from '../../pagination';
import './Pagination.css';

const Pagination = ({ page, total, onPageChange, loading = false, itemLabel = 'items', pageSize = LIST_PAGE_SIZE }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  return (
    <nav className="list-pagination" aria-label={`${itemLabel} pagination`}>
      <div className="list-pagination-summary">
        <span>Showing {start}–{end} of {total} {itemLabel}</span>
        <span className="list-pagination-size">{pageSize} per page</span>
      </div>
      <div className="list-pagination-buttons">
        <button type="button" onClick={() => onPageChange(1)} disabled={loading || currentPage <= 1}>First</button>
        <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={loading || currentPage <= 1}>Previous</button>
        <span className="list-pagination-page" aria-live="polite" aria-atomic="true">Page {currentPage} of {pages}</span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={loading || currentPage >= pages}>Next</button>
        <button type="button" onClick={() => onPageChange(pages)} disabled={loading || currentPage >= pages}>Last</button>
      </div>
    </nav>
  );
};

export default Pagination;
