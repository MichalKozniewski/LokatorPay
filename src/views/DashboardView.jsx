import React from 'react';
import { Card, PageHeader } from '../components/ui';

export function DashboardView({ db }) {
  const stats = [
    { label: 'Pokoje', value: db?.rooms?.length || 0, unit: 'zdefiniowanych' },
    { label: 'Lokatorzy', value: db?.tenants?.length || 0, unit: 'w lokalu' },
    { label: 'Liczniki', value: db?.meters?.length || 0, unit: 'odczytów' },
    { label: 'Wydatki', value: db?.expenses?.length || 0, unit: 'rachunków' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        badge="LokatorPay"
        title="Sprawiedliwe rozliczanie rachunków i mediów domowych"
        description="Podział czynszu według metrażu pokoi, liczniki prądu i wody (kWh, m³) oraz automatyczne bilanse dla lokatorów."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((item) => (
          <Card key={item.label} className="flex flex-col justify-between">
            <span className="text-sm font-semibold text-slate-700">{item.label}</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                {item.value}
              </span>
              <span className="text-xs font-medium text-slate-700">{item.unit}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}