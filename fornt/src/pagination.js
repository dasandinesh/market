import { useEffect, useState } from 'react';

export const LIST_PAGE_SIZE = 50;

export function useListPagination(items, resetKey = '') {
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  const start = (page - 1) * LIST_PAGE_SIZE;
  return { pageItems: items.slice(start, start + LIST_PAGE_SIZE), page, totalPages, setPage };
}
