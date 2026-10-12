import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import UnitField from './UnitField';
import '../../components/cutomer/customeradd.css';

const defaults = { name: '', malayalam: '', tamil: '', unit: '', price: '', pags: 0, wages: 0, commission: 0 };
const numeric = ['price', 'pags', 'wages', 'commission'];

const ProductAdd = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });
  const onSubmit = async (values) => {
    const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numeric.includes(key) ? Number(value || 0) : value]));
    setStatus({ type: '', message: '' });
    try {
      await fetchJson('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      reset(defaults); setStatus({ type: 'success', message: 'Product saved successfully.' });
    } catch (error) { setStatus({ type: 'error', message: error.message || 'Unable to save product.' }); }
  };
  return (
    <main className="customer-add-page">
      <section className="customer-add-card">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Product management</p>
          <h1>Add product</h1>
          <p>Add product names, quantities, and pricing information.</p>
        </div>
        <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Product details</legend>
            <div className="customer-form-grid">
              <Field label="Product name" required error={errors.name}><input {...register('name', { required: 'Product name is required.' })} /></Field>
              <Field label="Malayalam name"><input {...register('malayalam')} /></Field>
              <Field label="Tamil name"><input {...register('tamil')} /></Field>
              <UnitField registration={register('unit')} onSelect={(name) => setValue('unit', name, { shouldDirty: true })} disabled={isSubmitting} />
            </div>
          </fieldset>
          <fieldset>
            <legend>Pricing</legend>
            <div className="customer-form-grid">
              <Field label="Selling price" required error={errors.price}><input type="number" min="0" step="0.01" {...register('price', { required: 'Selling price is required.' })} /></Field>
              <Field label="Bag rate"><input type="number" min="0" step="0.01" {...register('pags')} /></Field>
              <Field label="Wages"><input type="number" min="0" step="0.01" {...register('wages')} /></Field>
              <Field label="Commission"><input type="number" min="0" step="0.01" {...register('commission')} /></Field>
            </div>
          </fieldset>
          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
          <div className="customer-form-actions">
            <button type="button" className="secondary-button" onClick={() => reset(defaults)}>Clear</button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product'}</button>
          </div>
        </form>
      </section>
    </main>
  );
};
const Field = ({ label, required, error, children }) => <label className="customer-field"><span>{label}{required && <b> *</b>}</span>{children}{error && <small className="field-error">{error.message}</small>}</label>;
export default ProductAdd;
