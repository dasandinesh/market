import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import UnitField from './UnitField';

jest.mock('../../api');

const selected = jest.fn();
const productSubmit = jest.fn();

function ProductForm() {
  const { register, setValue } = useForm({ defaultValues: { unit: '' } });
  return (
    <form aria-label="Product form" onSubmit={(event) => { event.preventDefault(); productSubmit(); }}>
      <UnitField registration={register('unit')} onSelect={(name) => { setValue('unit', name, { shouldDirty: true }); selected(name); }} />
      <button type="submit">Save product</button>
    </form>
  );
}

const openPopup = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add unit' }));
  return screen.getByRole('dialog', { name: 'Add unit' });
};

beforeEach(() => {
  fetchJson.mockReset();
  fetchJson.mockResolvedValue([]);
  selected.mockClear();
  productSubmit.mockClear();
});

afterEach(() => { jest.restoreAllMocks(); });

test('loads saved units into the datalist and keeps the registered input editable', async () => {
  fetchJson.mockResolvedValue([{ name: 'Kg' }, { name: 'Bag' }]);
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('#product-unit-options option')).toHaveLength(2));
  expect(fetchJson).toHaveBeenCalledWith('/api/units');
  expect(Array.from(container.querySelectorAll('option')).map((option) => option.value)).toEqual(['Kg', 'Bag']);
  const unit = screen.getByRole('combobox', { name: 'Unit' });
  expect(unit).toHaveAttribute('list', 'product-unit-options');
  fireEvent.change(unit, { target: { value: 'Box' } });
  expect(unit).toHaveValue('Box');
});

test('saves a trimmed unit, selects it in the product, and never submits the product form', async () => {
  fetchJson.mockResolvedValueOnce([{ name: 'Kg' }]).mockResolvedValueOnce({ name: 'Large bag' });
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(1));
  const popup = openPopup();
  expect(screen.getByRole('form', { name: 'Product form' })).not.toContainElement(popup);
  fireEvent.change(within(popup).getByLabelText('Unit name'), { target: { value: '  Large   bag  ' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Save unit' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fetchJson).toHaveBeenLastCalledWith('/api/units', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Large bag' }),
  });
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Large bag');
  expect(container.querySelector('option[value="Large bag"]')).toBeInTheDocument();
  expect(selected).toHaveBeenCalledWith('Large bag');
  expect(productSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Add unit' })).toHaveFocus();
});

test('rejects blank, oversized, and duplicate names while keeping the popup open', async () => {
  fetchJson.mockResolvedValue([{ name: 'Large bag' }]);
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(1));
  const popup = openPopup();
  const input = within(popup).getByLabelText('Unit name');
  const save = within(popup).getByRole('button', { name: 'Save unit' });
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.click(save);
  expect(within(popup).getByRole('alert')).toHaveTextContent('Unit name is required.');
  fireEvent.change(input, { target: { value: 'a'.repeat(101) } });
  fireEvent.click(save);
  expect(within(popup).getByRole('alert')).toHaveTextContent('100 characters or fewer');
  fireEvent.change(input, { target: { value: ' large   BAG ' } });
  fireEvent.click(save);
  expect(within(popup).getByRole('alert')).toHaveTextContent('already exists');
  expect(input).toHaveValue(' large   BAG ');
  expect(fetchJson).toHaveBeenCalledTimes(1);
  expect(productSubmit).not.toHaveBeenCalled();
});

test('shows API duplicate errors inline and allows retry without losing either form value', async () => {
  fetchJson.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('A unit with this name already exists.')).mockResolvedValueOnce({ name: 'Box' });
  render(<ProductForm />);
  await waitFor(() => expect(screen.queryByText('Loading units…')).not.toBeInTheDocument());
  fireEvent.change(screen.getByRole('combobox', { name: 'Unit' }), { target: { value: 'Kg' } });
  const popup = openPopup();
  expect(within(popup).getByText('No units added yet.')).toBeInTheDocument();
  const input = within(popup).getByLabelText('Unit name');
  fireEvent.change(input, { target: { value: 'Box' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Save unit' }));
  expect(await within(popup).findByRole('alert')).toHaveTextContent('already exists');
  expect(input).toHaveValue('Box');
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Kg');
  await waitFor(() => expect(within(popup).getByRole('button', { name: 'Save unit' })).toBeEnabled());
  fireEvent.click(within(popup).getByRole('button', { name: 'Save unit' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Box');
  expect(productSubmit).not.toHaveBeenCalled();
});

test('traps keyboard focus and restores focus after Escape, Cancel, and backdrop close', async () => {
  fetchJson.mockResolvedValue([{ name: 'Kg' }]);
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(1));
  const popup = openPopup();
  expect(within(popup).getByLabelText('Unit name')).toHaveFocus();
  const close = within(popup).getByRole('button', { name: 'Close unit popup' });
  const last = within(popup).getByRole('button', { name: 'Delete unit Kg' });
  close.focus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add unit' })).toHaveFocus();
  fireEvent.click(within(openPopup()).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Add unit' })).toHaveFocus();
  fireEvent.mouseDown(openPopup().parentElement);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add unit' })).toHaveFocus();
});

test('retries loading units and lets a saved unit be selected from the popup', async () => {
  fetchJson.mockRejectedValueOnce(new Error('Unable to load units.')).mockResolvedValueOnce([{ name: 'Bag' }]);
  const { container } = render(<ProductForm />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load units.');
  const popup = openPopup();
  fireEvent.click(within(popup).getByRole('button', { name: 'Retry units' }));
  fireEvent.click(await within(popup).findByRole('button', { name: 'Use unit Bag' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Bag');
  expect(container.querySelector('option[value="Bag"]')).toBeInTheDocument();
  expect(selected).toHaveBeenCalledWith('Bag');
  expect(productSubmit).not.toHaveBeenCalled();
});

test('blocks dismissal during a save and completes selecting the result', async () => {
  let finishSave;
  fetchJson.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
  render(<ProductForm />);
  await waitFor(() => expect(screen.queryByText('Loading units…')).not.toBeInTheDocument());
  const popup = openPopup();
  fireEvent.change(within(popup).getByLabelText('Unit name'), { target: { value: 'Crate' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Save unit' }));
  expect(within(popup).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent.keyDown(popup, { key: 'Escape' });
  fireEvent.mouseDown(popup.parentElement);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => { finishSave({ name: 'Crate' }); });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Crate');
});

test('ignores a save result after the product form unmounts', async () => {
  let finishSave;
  fetchJson.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
  const { unmount } = render(<ProductForm />);
  await waitFor(() => expect(screen.queryByText('Loading units…')).not.toBeInTheDocument());
  const popup = openPopup();
  fireEvent.change(within(popup).getByLabelText('Unit name'), { target: { value: 'Crate' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Save unit' }));
  unmount();
  await act(async () => { finishSave({ name: 'Crate' }); });
  expect(selected).not.toHaveBeenCalled();
});

test('a delayed initial load cannot remove a unit created while it was loading', async () => {
  let finishLoad;
  fetchJson.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; })).mockResolvedValueOnce({ name: 'Crate' });
  const { container } = render(<ProductForm />);
  const popup = openPopup();
  expect(within(popup).getByText('Loading units…')).toBeInTheDocument();
  fireEvent.change(within(popup).getByLabelText('Unit name'), { target: { value: 'Crate' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Save unit' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await act(async () => { finishLoad([{ name: 'Kg' }]); });
  expect(container.querySelector('option[value="Crate"]')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Crate');
});

test('canceling deletion keeps the suggestion and both draft inputs', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  fetchJson.mockResolvedValue([{ name: 'Kg' }]);
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(1));
  fireEvent.change(screen.getByRole('combobox', { name: 'Unit' }), { target: { value: 'Kg' } });
  const popup = openPopup();
  fireEvent.change(within(popup).getByLabelText('Unit name'), { target: { value: 'Crate draft' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Delete unit Kg' }));
  expect(confirm).toHaveBeenCalledWith('Delete unit Kg from suggestions? Existing products keep their units.');
  expect(fetchJson).toHaveBeenCalledTimes(1);
  expect(container.querySelector('option[value="Kg"]')).toBeInTheDocument();
  expect(within(popup).getByRole('button', { name: 'Use unit Kg' })).toBeInTheDocument();
  expect(within(popup).getByLabelText('Unit name')).toHaveValue('Crate draft');
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Kg');
  expect(productSubmit).not.toHaveBeenCalled();
});

test('deletes using an encoded name and keeps removal on reopening and reloading without changing the product draft', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  const removedName = 'Bag / 25 kg & pack';
  let serverUnits = [{ name: removedName }, { name: 'Kg' }];
  const deleteUrl = `/api/units?name=${encodeURIComponent(removedName)}`;
  fetchJson.mockImplementation((url, options) => {
    if (options?.method === 'DELETE') {
      serverUnits = serverUnits.filter((unit) => unit.name !== removedName);
      return Promise.resolve({ name: removedName, message: 'Unit deleted.' });
    }
    return Promise.resolve(serverUnits);
  });
  const { container, unmount } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(2));
  fireEvent.change(screen.getByRole('combobox', { name: 'Unit' }), { target: { value: removedName } });
  const popup = openPopup();
  const draft = within(popup).getByLabelText('Unit name');
  fireEvent.change(draft, { target: { value: 'Crate draft' } });
  const deleteButton = within(popup).getByRole('button', { name: `Delete unit ${removedName}` });
  deleteButton.focus();
  fireEvent.click(deleteButton);
  await waitFor(() => expect(within(popup).queryByRole('button', { name: `Use unit ${removedName}` })).not.toBeInTheDocument());
  expect(fetchJson).toHaveBeenCalledWith(deleteUrl, { method: 'DELETE' });
  expect(Array.from(container.querySelectorAll('option')).map((option) => option.value)).toEqual(['Kg']);
  expect(draft).toHaveValue('Crate draft');
  expect(draft).toHaveFocus();
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue(removedName);
  expect(selected).not.toHaveBeenCalled();
  expect(productSubmit).not.toHaveBeenCalled();
  fireEvent.click(within(popup).getByRole('button', { name: 'Cancel' }));
  const reopened = openPopup();
  expect(within(reopened).queryByRole('button', { name: `Delete unit ${removedName}` })).not.toBeInTheDocument();
  expect(within(reopened).getByRole('button', { name: 'Use unit Kg' })).toBeInTheDocument();
  unmount();
  const reloaded = render(<ProductForm />);
  await waitFor(() => expect(reloaded.container.querySelectorAll('option')).toHaveLength(1));
  expect(Array.from(reloaded.container.querySelectorAll('option')).map((option) => option.value)).toEqual(['Kg']);
});

test('a failed deletion preserves the unit and drafts and allows retry', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fetchJson.mockResolvedValueOnce([{ name: 'Kg' }]).mockRejectedValueOnce(new Error('Unable to delete unit.')).mockResolvedValueOnce({ name: 'Kg' });
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(1));
  fireEvent.change(screen.getByRole('combobox', { name: 'Unit' }), { target: { value: 'Kg' } });
  const popup = openPopup();
  const draft = within(popup).getByLabelText('Unit name');
  fireEvent.change(draft, { target: { value: 'Crate draft' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Delete unit Kg' }));
  expect(await within(popup).findByRole('alert')).toHaveTextContent('Unable to delete unit.');
  expect(container.querySelector('option[value="Kg"]')).toBeInTheDocument();
  expect(within(popup).getByRole('button', { name: 'Use unit Kg' })).toBeInTheDocument();
  expect(draft).toHaveValue('Crate draft');
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Kg');
  await waitFor(() => expect(within(popup).getByRole('button', { name: 'Delete unit Kg' })).toBeEnabled());
  fireEvent.click(within(popup).getByRole('button', { name: 'Delete unit Kg' }));
  await waitFor(() => expect(container.querySelector('option[value="Kg"]')).not.toBeInTheDocument());
  expect(within(popup).queryByRole('alert')).not.toBeInTheDocument();
  expect(within(popup).getByText('No units added yet.')).toBeInTheDocument();
  expect(draft).toHaveValue('Crate draft');
  expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('Kg');
  expect(selected).not.toHaveBeenCalled();
  expect(productSubmit).not.toHaveBeenCalled();
});

test('blocks modal dismissal, selection, and submission while deleting', async () => {
  let finishDelete;
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fetchJson.mockResolvedValueOnce([{ name: 'Kg' }, { name: 'Bag' }]).mockImplementationOnce(() => new Promise((resolve) => { finishDelete = resolve; }));
  const { container } = render(<ProductForm />);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(2));
  const popup = openPopup();
  fireEvent.change(within(popup).getByLabelText('Unit name'), { target: { value: 'Crate draft' } });
  fireEvent.click(within(popup).getByRole('button', { name: 'Delete unit Kg' }));
  expect(popup).toHaveAttribute('aria-busy', 'true');
  for (const button of within(popup).getAllByRole('button')) expect(button).toBeDisabled();
  expect(within(popup).getByLabelText('Unit name')).toBeDisabled();
  expect(container.querySelector('option[value="Kg"]')).toBeInTheDocument();
  fireEvent.click(within(popup).getByRole('button', { name: 'Use unit Bag' }));
  fireEvent.submit(within(popup).getByLabelText('Unit name').closest('form'));
  fireEvent.keyDown(popup, { key: 'Escape' });
  fireEvent.mouseDown(popup.parentElement);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(selected).not.toHaveBeenCalled();
  expect(productSubmit).not.toHaveBeenCalled();
  expect(fetchJson).toHaveBeenCalledTimes(2);
  await act(async () => { finishDelete({ name: 'Kg' }); });
  expect(within(popup).queryByRole('button', { name: 'Delete unit Kg' })).not.toBeInTheDocument();
  expect(within(popup).getByRole('button', { name: 'Use unit Bag' })).toBeEnabled();
  expect(within(popup).getByLabelText('Unit name')).toHaveValue('Crate draft');
  expect(within(popup).getByLabelText('Unit name')).toHaveFocus();
});

test('a unit load started before deletion cannot restore the removed suggestion', async () => {
  let finishOldLoad;
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fetchJson.mockImplementationOnce(() => new Promise((resolve) => { finishOldLoad = resolve; }))
    .mockResolvedValueOnce([{ name: 'Kg' }]).mockResolvedValueOnce({ name: 'Kg' });
  const { container } = render(<React.StrictMode><ProductForm /></React.StrictMode>);
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(1));
  const popup = openPopup();
  fireEvent.click(within(popup).getByRole('button', { name: 'Delete unit Kg' }));
  await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(0));
  await act(async () => { finishOldLoad([{ name: 'Kg' }]); });
  expect(container.querySelector('option[value="Kg"]')).not.toBeInTheDocument();
  expect(within(popup).queryByRole('button', { name: 'Use unit Kg' })).not.toBeInTheDocument();
});
