import React from 'react';

export function Card({ children, className = '' }) {
  return (
    <section
      className={`bg-white border border-slate-300 rounded-xl shadow-sm p-4 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function PageHeader({ badge, title, description, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div className="space-y-1 min-w-0">
        {badge && <Badge>{badge}</Badge>}
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight break-words">
          {title}
        </h1>
        {description && (
          <p className="text-sm sm:text-base text-slate-700 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Badge({ children, variant = 'neutral' }) {
  const styles = {
    neutral: 'bg-slate-200 text-slate-900 border-slate-300',
    primary: 'bg-indigo-100 text-indigo-950 border-indigo-300',
    success: 'bg-emerald-100 text-emerald-950 border-emerald-300',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold font-mono rounded-md border ${
        styles[variant] || styles.neutral
      }`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}) {
  const variants = {
    primary:
      'bg-indigo-700 text-white hover:bg-indigo-800 border-transparent focus-visible:ring-indigo-600',
    secondary:
      'bg-white text-slate-900 hover:bg-slate-100 border-slate-400 focus-visible:ring-slate-600',
    danger:
      'bg-rose-700 text-white hover:bg-rose-800 border-transparent focus-visible:ring-rose-600',
  };

  return (
    <button
      type={type}
      className={`min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        variants[variant] || variants.primary
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ id, label, error, hint, className = '', ...props }) {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className={`w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm text-slate-900 bg-white border rounded-lg placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          error
            ? 'border-rose-600 focus:ring-rose-600'
            : 'border-slate-400 focus:border-indigo-700 focus:ring-indigo-600'
        } ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-xs text-slate-700">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}