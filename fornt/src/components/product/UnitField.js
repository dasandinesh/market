import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchJson } from '../../api';
import './UnitField.css';

const normalizeName = (value) => value.trim().replace(/\s+/g, ' ');

export default function UnitField({ registration, onSelect, disabled = false }) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const busy = saving || Boolean(deletingUnit);
  const mounted = useRef(false);
  const loadRequest = useRef(0);
  const busyRef = useRef(false);
  const addButton = useRef(null);
  const dialog = useRef(null);
  const nameInput = useRef(null);
  const focusAfterDelete = useRef(false);

  const loadUnits = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchJson('/api/units');
      if (mounted.current && request === loadRequest.current) setUnits(data);
    } catch (error) {
      if (mounted.current && request === loadRequest.current) {
        setLoadError(error.message || 'Unable to load units.');
      }
    } finally {
      if (mounted.current && request === loadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadUnits();
    return () => {
      mounted.current = false;
      loadRequest.current += 1;
    };
  }, [loadUnits]);

  const closeDialog = useCallback(() => {
    if (!busyRef.current) setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const trigger = addButton.current;
    nameInput.current?.focus();

    const focusableElements = () => Array.from(dialog.current?.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
    ) || []);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDialog();
      } else if (event.key === 'Tab') {
        const elements = focusableElements();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const keepFocusInside = (event) => {
      if (!dialog.current?.contains(event.target)) {
        (focusableElements()[0] || dialog.current)?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', keepFocusInside);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen, closeDialog]);

  useEffect(() => {
    if (isOpen && !busy && focusAfterDelete.current) {
      focusAfterDelete.current = false;
      nameInput.current?.focus();
    }
  }, [isOpen, busy]);

  const openDialog = () => {
    if (busyRef.current) return;
    setName('');
    setSaveError('');
    setDeleteError('');
    setIsOpen(true);
  };

  const selectUnit = (unitName) => {
    if (busyRef.current) return;
    onSelect(unitName);
    closeDialog();
  };

  const saveUnit = async (event) => {
    // Portal events still bubble through React to the product form.
    event.preventDefault();
    event.stopPropagation();
    if (busyRef.current) return;
    const unitName = normalizeName(name);
    if (!unitName) {
      setSaveError('Unit name is required.');
      nameInput.current?.focus();
      return;
    }
    if (unitName.length > 100) {
      setSaveError('Unit name must be 100 characters or fewer.');
      nameInput.current?.focus();
      return;
    }
    if (units.some((unit) => normalizeName(unit.name).toLowerCase() === unitName.toLowerCase())) {
      setSaveError('A unit with this name already exists.');
      nameInput.current?.focus();
      return;
    }

    busyRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const savedUnit = await fetchJson('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: unitName }),
      });
      if (!mounted.current) return;
      // A load started before this save must not overwrite the newly added unit.
      loadRequest.current += 1;
      setLoading(false);
      setLoadError('');
      setUnits((current) => [...current.filter((unit) => unit.name.toLowerCase() !== savedUnit.name.toLowerCase()), savedUnit]
        .sort((first, second) => first.name.localeCompare(second.name)));
      onSelect(savedUnit.name);
      setIsOpen(false);
    } catch (error) {
      if (mounted.current) setSaveError(error.message || 'Unable to save unit.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const deleteUnit = async (unit) => {
    if (busyRef.current) return;
    if (!window.confirm(`Delete unit ${unit.name} from suggestions? Existing products keep their units.`)) return;
    const key = normalizeName(unit.name).toLowerCase();
    busyRef.current = true;
    setDeletingUnit(key);
    setDeleteError('');
    try {
      await fetchJson(`/api/units?name=${encodeURIComponent(unit.name)}`, { method: 'DELETE' });
      if (!mounted.current) return;
      // Ignore pre-delete loads that still include the removed suggestion.
      loadRequest.current += 1;
      setLoading(false);
      setLoadError('');
      setUnits((current) => current.filter((item) => normalizeName(item.name).toLowerCase() !== key));
      focusAfterDelete.current = true;
    } catch (error) {
      if (mounted.current) setDeleteError(error.message || 'Unable to delete unit.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setDeletingUnit('');
    }
  };

  const loadStatus = loadError ? (
    <div className="unit-field-load-error">
      <p role="alert">{loadError}</p>
      <button className="unit-field-retry" type="button" onClick={loadUnits} disabled={busy}>Retry units</button>
    </div>
  ) : loading ? <p className="unit-field-status" role="status">Loading units…</p> : null;

  return (
    <div className="customer-field unit-field">
      <label htmlFor="product-unit">Unit</label>
      <div className="unit-field-row">
        <input id="product-unit" list="product-unit-options" {...registration} disabled={disabled} />
        <button className="unit-field-add" type="button" onClick={openDialog} disabled={disabled || busy} ref={addButton}>
          Add unit
        </button>
      </div>
      <datalist id="product-unit-options">
        {units.map((unit) => <option key={unit.name} value={unit.name} />)}
      </datalist>
      {!isOpen && loadStatus}

      {isOpen && createPortal(
        <div className="unit-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <section className="unit-modal" role="dialog" aria-modal="true" aria-labelledby="unit-modal-title" aria-busy={busy} tabIndex={-1} ref={dialog}>
            <header className="unit-modal-heading">
              <h2 id="unit-modal-title">Add unit</h2>
              <button className="unit-modal-close" type="button" aria-label="Close unit popup" onClick={closeDialog} disabled={busy}>×</button>
            </header>
            <form className="unit-modal-form" onSubmit={saveUnit} noValidate>
              <label htmlFor="new-unit-name">Unit name</label>
              <input id="new-unit-name" value={name} onChange={(event) => { setName(event.target.value); setSaveError(''); }} ref={nameInput} disabled={busy} aria-invalid={Boolean(saveError)} aria-describedby={saveError ? 'unit-modal-error' : 'unit-modal-hint'} />
              <p className="unit-field-status" id="unit-modal-hint">Up to 100 characters.</p>
              {saveError && <p className="unit-modal-error" role="alert" id="unit-modal-error">{saveError}</p>}
              <div className="unit-modal-actions">
                <button className="unit-modal-cancel" type="button" onClick={closeDialog} disabled={busy}>Cancel</button>
                <button className="unit-modal-save" type="submit" disabled={busy}>{saving ? 'Saving…' : 'Save unit'}</button>
              </div>
            </form>
            <div className="unit-modal-existing">
              <h3>Existing units</h3>
              <p className="unit-field-status unit-modal-existing-hint">Deleting a unit removes it from suggestions. Existing products keep their units.</p>
              {loadStatus}
              {deleteError && <p className="unit-modal-error" role="alert">{deleteError}</p>}
              {!loading && !loadError && units.length === 0 && <p className="unit-field-status">No units added yet.</p>}
              {units.length > 0 && (
                <ul className="unit-modal-list">
                  {units.map((unit) => (
                    <li key={unit.name}>
                      <button type="button" onClick={() => selectUnit(unit.name)} disabled={busy} aria-label={`Use unit ${unit.name}`}>{unit.name}</button>
                      <button className="unit-modal-delete" type="button" onClick={() => deleteUnit(unit)} disabled={busy} aria-label={`Delete unit ${unit.name}`}>
                        {deletingUnit === normalizeName(unit.name).toLowerCase() ? 'Deleting…' : 'Delete'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
