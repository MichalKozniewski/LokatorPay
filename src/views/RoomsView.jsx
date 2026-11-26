import React, { useState } from 'react';
import { Card, PageHeader, Button, Input, Badge } from '../components/ui';

function formatArea(value) {
  return Number(value || 0).toFixed(2);
}

export function RoomsView({ store }) {
  const { apartment, role, members, rooms, totalArea } = store.scopedData;
  const isAdmin = role === 'admin';

  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [error, setError] = useState('');

  const handleAddRoom = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await store.addRoom({
        name,
        area,
        tenantId: selectedTenantId || null,
      });
      setName('');
      setArea('');
      setSelectedTenantId('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignChange = async (roomId, tenantId) => {
    setError('');
    try {
      await store.assignTenantToRoom({ roomId, tenantId: tenantId || null });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveRoom = async (roomId) => {
    setError('');
    try {
      await store.removeRoom(roomId);
    } catch (err) {
      setError(err.message);
    }
  };

  const assignedCount = rooms.filter((r) => Boolean(r.tenantId)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        badge={`Lokal: ${apartment.name}`}
        title="Pokoje i metraż (m²)"
        description="Zdefiniuj powierzchnię każdego pokoju oraz przypisz do niego zarejestrowanego lokatora, aby umożliwić sprawiedliwy podział czynszu."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <span className="text-sm font-semibold text-slate-700">Metraż całkowity lokalu</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">
              {formatArea(totalArea)}
            </span>
            <span className="text-sm font-semibold text-slate-700">m²</span>
          </div>
        </Card>

        <Card>
          <span className="text-sm font-semibold text-slate-700">Liczba pokoi</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">
              {rooms.length}
            </span>
            <span className="text-sm font-medium text-slate-700">zdefiniowanych</span>
          </div>
        </Card>

        <Card>
          <span className="text-sm font-semibold text-slate-700">Przypisane pokoje</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">
              {assignedCount} / {rooms.length}
            </span>
            <span className="text-sm font-medium text-slate-700">zajętych</span>
          </div>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Dodaj nowy pokój
              </h2>
              <Badge variant="primary">Administrator lokalu</Badge>
            </div>

            <form
              onSubmit={handleAddRoom}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
              noValidate
            >
              <Input
                id="room-name"
                label="Nazwa pokoju"
                type="text"
                placeholder="np. Pokój 1 (z balkonem)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                id="room-area"
                label="Metraż (m²)"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="np. 14.50"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                required
              />

              <div className="w-full space-y-1.5">
                <label
                  htmlFor="room-tenant"
                  className="block text-sm font-semibold text-slate-900"
                >
                  Lokator (opcjonalnie)
                </label>
                <select
                  id="room-tenant"
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm text-slate-900 bg-white border border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-indigo-700 focus:ring-indigo-600"
                >
                  <option value="">— Pokój wolny —</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" className="w-full">
                Dodaj pokój
              </Button>
            </form>
          </div>
        </Card>
      )}

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-sm font-semibold text-rose-800"
        >
          {error}
        </div>
      )}

      <Card>
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Lista pokoi ({rooms.length})
          </h2>

          {rooms.length === 0 ? (
            <p className="text-sm text-slate-700 py-4 text-center">
              Brak zdefiniowanych pokoi w tym lokalu.
              {isAdmin
                ? ' Dodaj pierwszy pokój powyżej, aby obliczyć łączny metraż mieszkania.'
                : ' Administrator lokalu nie dodał jeszcze pokoi.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {rooms.map((room) => {
                const sharePercent =
                  totalArea > 0 ? ((Number(room.area) / totalArea) * 100).toFixed(1) : '0.0';
                const assignedMember = members.find((m) => m.userId === room.tenantId);

                return (
                  <li
                    key={room.id}
                    className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-slate-900 break-words">
                          {room.name}
                        </span>
                        <Badge variant="neutral">{formatArea(room.area)} m²</Badge>
                        <Badge variant="primary">{sharePercent}% udziału</Badge>
                      </div>
                      <p className="text-xs text-slate-700 break-words">
                        Przypisany lokator:{' '}
                        <strong>
                          {assignedMember
                            ? `${assignedMember.name} (${assignedMember.email})`
                            : 'Brak (pokój wolny)'}
                        </strong>
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        <label htmlFor={`assign-${room.id}`} className="sr-only">
                          Przypisz lokatora do pokoju {room.name}
                        </label>
                        <select
                          id={`assign-${room.id}`}
                          value={room.tenantId || ''}
                          onChange={(e) => handleAssignChange(room.id, e.target.value)}
                          className="min-h-[44px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-700 focus:ring-indigo-600"
                        >
                          <option value="">— Pokój wolny —</option>
                          {members.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {member.name}
                            </option>
                          ))}
                        </select>

                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => handleRemoveRoom(room.id)}
                        >
                          Usuń
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}