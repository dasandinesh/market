import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AtlasSync from './AtlasSync';
import { fetchJson } from '../../api';

jest.mock('../../api', () => ({ fetchJson: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));

const saved = { configured: true, host: 'sample.mongodb.net', database: 'market_cloud', enabled: true,
  connection: 'connected', running: false, localConnected: true, pending: 2, conflicts: 0, lastSyncAt: null };

beforeEach(() => {
  fetchJson.mockReset();
  fetchJson.mockImplementation(url => Promise.resolve(url.endsWith('/conflicts') ? [] : saved));
});

test('loads saved settings without returning credentials and allows manual sync', async () => {
  render(<AtlasSync />);
  expect(await screen.findByDisplayValue('market_cloud')).toBeInTheDocument();
  expect(screen.getByLabelText('Atlas connection string')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/atlas-sync/sync', expect.objectContaining({ method: 'POST' })));
  expect(await screen.findByText(/Sync check complete/)).toBeInTheDocument();
});

test('saves settings with the existing connection and can pause automatic sync', async () => {
  render(<AtlasSync />);
  await screen.findByDisplayValue('market_cloud');
  fireEvent.click(screen.getByLabelText('Automatically sync when Atlas is reachable'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/atlas-sync/connection', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ uri: '', database: 'market_cloud', enabled: false, confirmTargetChange: false }),
  })));
});

test('requires reviewing current conflict versions before resolving a deletion', async () => {
  const conflict = { key: 'record-key', collection: 'customers', documentId: '"customer-id"' };
  fetchJson.mockImplementation(url => Promise.resolve(url.endsWith('/conflicts') ? [conflict]
    : url.endsWith('/conflicts/record-key') ? { local: null, cloud: '{"name":"Atlas customer"}', localHash: null, cloudHash: 'revision' }
      : saved));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<AtlasSync />);
  expect(await screen.findByText('customers')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Keep Local' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review versions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Keep Local' }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/atlas-sync/conflicts/record-key/resolve', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ side: 'local', localHash: null, cloudHash: 'revision' }),
  })));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Delete the record'));
  confirm.mockRestore();
});
