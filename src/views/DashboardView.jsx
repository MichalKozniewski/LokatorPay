import React from 'react';
import { Card, PageHeader } from '../components/ui';

export function DashboardView({ scopedData }) {
  const { apartment, role, members, rooms, meters, expenses } = scopedData;

  const stats = [
    { label: 'Pokoje', value: rooms.length, unit: 'w tym lokalu' },
    { label: 'Lokatorzy', value: members.length, unit: 'przypisanych' },
    { label: 'Liczniki', value: meters.length, unit: 'odczytów' },
    { label: 'Wydatki', value: expenses.length, unit: 'rachunków' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        badge={`${apartment.name} • ${role === 'admin' ? 'Administrator' : 'Lokator'}`}
        title="Sprawiedliwe rozliczanie rachunków i mediów domowych"
        description={
          apartment.address
            ? `Adres lokalu: ${apartment.address}. Podział czynszu według metrażu pokoi, liczniki prądu i wody oraz automatyczne bilanse.`
            : 'Podział czynszu według metrażu pokoi, liczniki prądu i wody (kWh, m³) oraz automatyczne bilanse dla lokatorów.'
        }
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