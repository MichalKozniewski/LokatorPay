import React, { useState } from 'react';
import { Card, PageHeader, Button, Input, Badge } from '../components/ui';

export function DashboardRoomsView({ store }) {
  const { apartment, role, members, rooms, totalArea, invites } = store.scopedData;
  const isAdmin = role === 'admin';

  // Stan formularza zaproszeń (US2)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRecipient, setInviteRecipient] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied] = useState(false);

  // Stan formularza pokoju (US3)
  const [roomName, setRoomName] = useState('');
  const [roomArea, setRoomArea] = useState('');
  const [roomTenantId, setRoomTenantId] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [assignError, setAssignError] = useState('');
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomArea, setEditRoomArea] = useState('');
  const [editRoomError, setEditRoomError] = useState('');
  const [editRoomLoading, setEditRoomLoading] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');
  const [memberActionMessage, setMemberActionMessage] = useState('');

  if (!apartment) return null;

  // Lokatorzy już przypisani do jakiegoś pokoju (jeden lokator = maks. jeden pokój w lokalu)
  const assignedTenantIds = new Set(
    rooms.filter((r) => Boolean(r.tenantId)).map((r) => r.tenantId)
  );

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setCopied(false);
    setInviteLoading(true);
    try {
      const res = await store.createInvite({
        apartmentId: apartment.id,
        email: inviteEmail,
      });
      setGeneratedLink(res.link);
      setInviteRecipient(res.email || inviteEmail.trim());
      setInviteEmail('');
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    setRoomError('');
    setRoomLoading(true);
    try {
      await store.addRoom({
        name: roomName,
        area: roomArea,
        tenantId: roomTenantId || null,
      });
      setRoomName('');
      setRoomArea('');
      setRoomTenantId('');
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setRoomLoading(false);
    }
  };

  const handleAssignTenant = async (roomId, tenantId) => {
    setAssignError('');
    try {
      await store.assignTenantToRoom({
        roomId,
        tenantId: tenantId || null,
      });
    } catch (err) {
      setAssignError(err.message);
    }
  };

  const startEditingRoom = (room) => {
    setEditingRoomId(room.id);
    setEditRoomName(room.name);
    setEditRoomArea(String(room.area));
    setEditRoomError('');
  };

  const cancelEditingRoom = () => {
    setEditingRoomId(null);
    setEditRoomError('');
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();
    if (!editingRoomId) return;
    setEditRoomError('');
    setEditRoomLoading(true);
    try {
      await store.updateRoom({
        roomId: editingRoomId,
        name: editRoomName,
        area: editRoomArea,
      });
      setEditingRoomId(null);
    } catch (err) {
      setEditRoomError(err.message);
    } finally {
      setEditRoomLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    setAssignError('');
    try {
      await store.removeRoom(roomId);
      if (editingRoomId === roomId) setEditingRoomId(null);
    } catch (err) {
      setAssignError(err.message);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Usunąć ${member.name} z lokalu?`)) return;
    setMemberActionError('');
    setMemberActionMessage('');
    try {
      await store.removeApartmentMember({
        apartmentId: apartment.id,
        userId: member.userId,
      });
    } catch (err) {
      setMemberActionError(err.message);
    }
  };

  const handleTransferAdmin = async (member) => {
    if (!window.confirm(`Przekazać rolę administratora użytkownikowi ${member.name}?`)) {
      return;
    }
    setMemberActionError('');
    setMemberActionMessage('');
    try {
      await store.transferApartmentAdmin({
        apartmentId: apartment.id,
        userId: member.userId,
      });
      setMemberActionMessage(`Rola administratora została przekazana użytkownikowi ${member.name}.`);
    } catch (err) {
      setMemberActionError(err.message);
    }
  };

  const mailtoHref = generatedLink
    ? `mailto:${encodeURIComponent(inviteRecipient)}?subject=${encodeURIComponent(
        `Zaproszenie do lokalu ${apartment.name} w LokatorPay`
      )}&body=${encodeURIComponent(
        `Cześć!\n\nDołącz do rozliczeń lokalu "${apartment.name}" w aplikacji LokatorPay, klikając jednorazowy link zaproszeniowy:\n${generatedLink}`
      )}`
    : '';

  return (
    <div className="space-y-6">
      <PageHeader
        badge={isAdmin ? 'Panel Administratora Lokalu' : 'Widok Lokatora'}
        title={apartment.name}
        description={
          apartment.address
            ? `Adres: ${apartment.address}`
            : 'Zarządzanie lokatorami, pokojami oraz udziałami metrażowymi lokalu.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Łączny metraż: {totalArea.toFixed(2)} m²</Badge>
            <Badge variant="neutral">Pokoje: {rooms.length}</Badge>
            <Badge variant="neutral">Lokatorzy: {members.length}</Badge>
          </div>
        }
      />

      {/* Podsumowanie metrażu (NFR-03) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Łączna powierzchnia pokoi
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {totalArea.toFixed(2)} m²
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Automatyczna suma zdefiniowanych pokoi
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Zdefiniowane pokoje
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{rooms.length}</p>
          <p className="text-xs text-slate-600 mt-1">
            Przypisanych: {rooms.filter((r) => Boolean(r.tenantId)).length} z {rooms.length}
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Domownicy w lokalu
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{members.length}</p>
          <p className="text-xs text-slate-600 mt-1">
            Twoja rola: {isAdmin ? 'Administrator lokalu' : 'Lokator'}
          </p>
        </Card>
      </div>

      {/* US3: Pokoje i metraż */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {isAdmin && (
          <Card className="lg:col-span-1 h-fit">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Dodaj pokój</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Podaj nazwę oraz dodatni metraż w m² (np. 14.50).
                </p>
              </div>

              <form onSubmit={handleAddRoom} className="space-y-4">
                <Input
                  id="room-name"
                  label="Nazwa pokoju"
                  placeholder="np. Pokój 1 (balkon)"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                />

                <Input
                  id="room-area"
                  label="Metraż (m²)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="np. 15.50"
                  value={roomArea}
                  onChange={(e) => setRoomArea(e.target.value)}
                  required
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="room-tenant"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Przypisz lokatora (opcjonalnie)
                  </label>
                  <select
                    id="room-tenant"
                    value={roomTenantId}
                    onChange={(e) => setRoomTenantId(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">-- Wolny pokój --</option>
                    {members.map((m) => {
                      const alreadyAssigned = assignedTenantIds.has(m.userId);
                      return (
                        <option
                          key={m.userId}
                          value={m.userId}
                          disabled={alreadyAssigned}
                        >
                          {m.name} ({m.email})
                          {alreadyAssigned ? ' [ma już pokój]' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {roomError && (
                  <p role="alert" className="text-xs font-semibold text-rose-700">
                    {roomError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={roomLoading}>
                  {roomLoading ? 'Zapisywanie...' : 'Dodaj pokój'}
                </Button>
              </form>
            </div>
          </Card>
        )}

        <Card className={isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Lista pokoi i udziałów metrażowych
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Udział procentowy stanowi podstawę do podziału kosztów proporcjonalnych do metrażu.
                </p>
              </div>
              <Badge variant="primary">Suma: {totalArea.toFixed(2)} m²</Badge>
            </div>

            {assignError && (
              <p role="alert" className="text-xs font-semibold text-rose-700">
                {assignError}
              </p>
            )}

            {rooms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Brak zdefiniowanych pokoi w tym lokalu.
                </p>
                {isAdmin && (
                  <p className="text-xs text-slate-600 mt-1">
                    Użyj formularza obok, aby dodać pierwszy pokój i określić jego metraż.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {rooms.map((room) => {
                  const sharePercent =
                    totalArea > 0 ? ((room.area / totalArea) * 100).toFixed(2) : '0.00';
                  const assignedMember = members.find((m) => m.userId === room.tenantId);

                  return (
                    <div
                      key={room.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                    >
                      {editingRoomId === room.id ? (
                        <form
                          onSubmit={handleUpdateRoom}
                          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_8rem_auto] gap-3 items-end"
                        >
                          <Input
                            id={`edit-room-name-${room.id}`}
                            label="Nazwa pokoju"
                            value={editRoomName}
                            onChange={(e) => setEditRoomName(e.target.value)}
                            required
                          />
                          <Input
                            id={`edit-room-area-${room.id}`}
                            label="Metraż (m²)"
                            type="number"
                            min="0.01"
                            max="9999.99"
                            step="0.01"
                            value={editRoomArea}
                            onChange={(e) => setEditRoomArea(e.target.value)}
                            required
                          />
                          {editRoomError && (
                            <p
                              role="alert"
                              className="sm:col-span-2 lg:col-span-3 text-sm font-semibold text-rose-700"
                            >
                              {editRoomError}
                            </p>
                          )}
                          <div className="sm:col-span-2 lg:col-span-1 flex flex-wrap gap-2 sm:justify-end lg:justify-start">
                            <Button
                              type="submit"
                              disabled={editRoomLoading}
                              className="px-3"
                            >
                              {editRoomLoading ? 'Zapisywanie...' : 'Zapisz'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={cancelEditingRoom}
                              disabled={editRoomLoading}
                              className="px-3"
                            >
                              Anuluj
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-900 break-words">
                                {room.name}
                              </h3>
                              <Badge variant="primary">{room.area.toFixed(2)} m²</Badge>
                              <Badge variant="neutral">Udział: {sharePercent}%</Badge>
                            </div>
                            <p className="text-xs text-slate-700">
                              Lokator:{' '}
                              <span className="font-semibold text-slate-900">
                                {assignedMember
                                  ? `${assignedMember.name} (${assignedMember.email})`
                                  : 'Nieprzypisany'}
                              </span>
                            </p>
                          </div>

                          {isAdmin && (
                            <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
                              <select
                                aria-label={`Przypisz lokatora do pokoju ${room.name}`}
                                value={room.tenantId || ''}
                                onChange={(e) => handleAssignTenant(room.id, e.target.value)}
                                className="min-h-[44px] max-w-[9rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 sm:max-w-none sm:text-sm"
                              >
                                <option value="">-- Wolny pokój --</option>
                                {members.map((m) => {
                                  const takenElsewhere =
                                    assignedTenantIds.has(m.userId) && room.tenantId !== m.userId;
                                  return (
                                    <option
                                      key={m.userId}
                                      value={m.userId}
                                      disabled={takenElsewhere}
                                    >
                                      {m.name}
                                      {takenElsewhere ? ' (przypisany)' : ''}
                                    </option>
                                  );
                                })}
                              </select>

                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => startEditingRoom(room)}
                                className="shrink-0 whitespace-nowrap px-3 text-xs"
                              >
                                Edytuj
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                onClick={() => handleDeleteRoom(room.id)}
                                className="shrink-0 whitespace-nowrap px-3 text-xs"
                              >
                                Usuń
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* US2: Domownicy oraz jednorazowe zaproszenia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Domownicy lokalu</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Osoby posiadające dostęp do danych tego mieszkania.
              </p>
            </div>

            {memberActionError && (
              <p role="alert" className="text-sm font-semibold text-rose-700">
                {memberActionError}
              </p>
            )}
            {memberActionMessage && (
              <p role="status" className="text-sm font-semibold text-emerald-800">
                {memberActionMessage}
              </p>
            )}

            <ul className="divide-y divide-slate-200">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {member.name}
                    </p>
                    <p className="text-xs text-slate-600 truncate">{member.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={member.role === 'admin' ? 'primary' : 'neutral'}>
                      {member.role === 'admin' ? 'Administrator' : 'Lokator'}
                    </Badge>
                    {isAdmin && member.role === 'tenant' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3 text-xs"
                          onClick={() => handleTransferAdmin(member)}
                        >
                          Przekaż admina
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          className="px-3 text-xs"
                          onClick={() => handleRemoveMember(member)}
                        >
                          Usuń z lokalu
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {isAdmin && (
          <Card>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Zaproś współlokatora</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Wygeneruj jednorazowy link zaproszeniowy (opcjonalnie powiązany z konkretnym adresem e-mail).
                </p>
              </div>

              <form onSubmit={handleGenerateInvite} className="space-y-3">
                <Input
                  id="invite-email"
                  type="email"
                  label="Adres e-mail współlokatora (opcjonalnie)"
                  placeholder="np. jan.kowalski@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />

                {inviteError && (
                  <p role="alert" className="text-xs font-semibold text-rose-700">
                    {inviteError}
                  </p>
                )}

                <Button type="submit" variant="secondary" disabled={inviteLoading}>
                  {inviteLoading ? 'Generowanie...' : 'Wygeneruj jednorazowy link'}
                </Button>
              </form>

              {generatedLink && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-indigo-950">
                    Jednorazowy link zaproszeniowy:
                  </p>
                  <p className="text-xs font-mono bg-white border border-indigo-200 rounded px-2.5 py-2 text-slate-900 break-all">
                    {generatedLink}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleCopyLink}
                      className="text-xs px-3"
                    >
                      {copied ? 'Skopiowano!' : 'Kopiuj link'}
                    </Button>
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center justify-center min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Otwórz w kliencie poczty (mailto:)
                    </a>
                  </div>
                </div>
              )}

              {invites && invites.length > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">
                    Historia zaproszeń ({invites.length}):
                  </p>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                    {invites.map((inv) => (
                      <li
                        key={inv.token}
                        className="flex items-center justify-between gap-2 text-xs text-slate-700 bg-slate-50 rounded px-2.5 py-1.5"
                      >
                        <span className="truncate">
                          {inv.email || `Link ogólny (${inv.token.slice(0, 8)}...)`}
                        </span>
                        <Badge variant={inv.used ? 'neutral' : 'success'}>
                          {inv.used ? 'Wykorzystane' : 'Aktywne'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}