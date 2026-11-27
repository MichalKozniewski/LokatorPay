import React, { useEffect, useState } from 'react';
import { Card, PageHeader, Button, Input, Badge } from '../components/ui';

export function DashboardRoomsView({ store }) {
  const {
    apartment,
    role,
    members,
    rooms,
    totalArea,
    invites,
    rent,
    expenses,
    balances,
    suggestedTransfers,
    completedTransfers,
  } = store.scopedData;
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
  const [rentAmount, setRentAmount] = useState('');
  const [billingStartDay, setBillingStartDay] = useState('1');
  const [rentSaving, setRentSaving] = useState(false);
  const [rentError, setRentError] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayerId, setExpensePayerId] = useState('');
  const [expenseParticipantIds, setExpenseParticipantIds] = useState([]);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [transferLoadingId, setTransferLoadingId] = useState('');
  const [transferError, setTransferError] = useState('');
  const [rentAssignmentPrompt, setRentAssignmentPrompt] = useState(null);
  const [rentAssignmentSaving, setRentAssignmentSaving] = useState(false);
  const currentUserId = store.session?.user?.id;
  const memberIdsKey = members
    .map((member) => member.userId)
    .sort()
    .join('|');

  useEffect(() => {
    setRentAmount(rent?.settings ? String(rent.settings.rentAmount) : '');
    setBillingStartDay(
      rent?.settings ? String(rent.settings.billingStartDay) : '1'
    );
  }, [apartment?.id, rent?.settings?.rentAmount, rent?.settings?.billingStartDay]);

  useEffect(() => {
    setExpenseDescription('');
    setExpenseAmount('');
    setExpensePayerId(currentUserId || members[0]?.userId || '');
    setExpenseParticipantIds(memberIdsKey ? memberIdsKey.split('|') : []);
    setExpenseError('');
  }, [apartment?.id, currentUserId, memberIdsKey]);

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

  const saveNewRoom = async (includeInCurrentRent) => {
    setRoomError('');
    setRoomLoading(true);
    try {
      await store.addRoom({
        name: roomName,
        area: roomArea,
        tenantId: roomTenantId || null,
        includeInCurrentRent,
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

  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (roomTenantId && rent?.settings) {
      setRentAssignmentPrompt({
        kind: 'new-room',
        tenantId: roomTenantId,
      });
      return;
    }
    await saveNewRoom(true);
  };

  const saveTenantAssignment = async (roomId, tenantId, includeInCurrentRent) => {
    setAssignError('');
    try {
      await store.assignTenantToRoom({
        roomId,
        tenantId: tenantId || null,
        includeInCurrentRent,
      });
    } catch (err) {
      setAssignError(err.message);
    }
  };

  const handleAssignTenant = async (roomId, tenantId) => {
    setAssignError('');
    if (tenantId && rent?.settings) {
      setRentAssignmentPrompt({
        kind: 'existing-room',
        roomId,
        tenantId,
      });
      return;
    }
    await saveTenantAssignment(roomId, tenantId, true);
  };

  const chooseRentAssignment = async (includeInCurrentRent) => {
    if (!rentAssignmentPrompt) return;
    setRentAssignmentSaving(true);
    try {
      if (rentAssignmentPrompt.kind === 'new-room') {
        await store.addRoom({
          name: roomName,
          area: roomArea,
          tenantId: rentAssignmentPrompt.tenantId,
          includeInCurrentRent,
        });
        setRoomName('');
        setRoomArea('');
        setRoomTenantId('');
      } else {
        await store.assignTenantToRoom({
          roomId: rentAssignmentPrompt.roomId,
          tenantId: rentAssignmentPrompt.tenantId,
          includeInCurrentRent,
        });
      }
      setRentAssignmentPrompt(null);
    } catch (err) {
      if (rentAssignmentPrompt.kind === 'new-room') {
        setRoomError(err.message);
      } else {
        setAssignError(err.message);
      }
      setRentAssignmentPrompt(null);
    } finally {
      setRentAssignmentSaving(false);
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

  const handleSaveRentSettings = async (e) => {
    e.preventDefault();
    setRentError('');
    setRentSaving(true);
    try {
      await store.saveRentSettings({
        rentAmount,
        billingStartDay,
      });
    } catch (err) {
      setRentError(err.message);
    } finally {
      setRentSaving(false);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    setExpenseError('');
    if (expenseParticipantIds.length === 0) {
      setExpenseError('Wybierz co najmniej jednego uczestnika.');
      return;
    }

    setExpenseSaving(true);
    try {
      await store.addExpense({
        description: expenseDescription,
        amount: expenseAmount,
        payerUserId: expensePayerId,
        participantUserIds: expenseParticipantIds,
      });
      setExpenseDescription('');
      setExpenseAmount('');
    } catch (err) {
      setExpenseError(err.message);
    } finally {
      setExpenseSaving(false);
    }
  };

  const toggleExpenseParticipant = (userId) => {
    setExpenseError('');
    setExpenseParticipantIds((selected) =>
      selected.includes(userId)
        ? selected.filter((selectedId) => selectedId !== userId)
        : [...selected, userId]
    );
  };

  const handleCompleteTransfer = async (transfer) => {
    setTransferError('');
    setTransferLoadingId(`${transfer.toUserId}-${transfer.amount}`);
    try {
      await store.completeSuggestedTransfer({
        recipientUserId: transfer.toUserId,
        amount: transfer.amount,
      });
    } catch (err) {
      setTransferError(err.message);
    } finally {
      setTransferLoadingId('');
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
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Proponowane przelewy</h2>
              <p className="mt-1 text-xs text-slate-600">
                Plan wyrównuje salda możliwie małą liczbą przelewów. Oznacz przelew dopiero po
                jego wykonaniu.
              </p>
            </div>
            {transferError && (
              <p role="alert" className="text-sm font-semibold text-rose-700">
                {transferError}
              </p>
            )}
            {suggestedTransfers?.length ? (
              <ul className="divide-y divide-slate-200">
                {suggestedTransfers.map((transfer) => {
                  const transferId = `${transfer.toUserId}-${transfer.amount}`;
                  const isSender = transfer.fromUserId === currentUserId;
                  return (
                    <li
                      key={transferId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {transfer.fromName} → {transfer.toName}
                        </p>
                        <p className="text-sm text-slate-700">
                          {Number(transfer.amount).toFixed(2)} zł
                        </p>
                      </div>
                      {isSender ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleCompleteTransfer(transfer)}
                          disabled={Boolean(transferLoadingId)}
                          className="px-3 text-xs"
                        >
                          {transferLoadingId === transferId
                            ? 'Zapisywanie...'
                            : 'Oznacz jako zrealizowany'}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-600">
                          Oczekiwanie na przelew
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
                Salda są wyrównane. Nie ma przelewów do wykonania.
              </p>
            )}
            {completedTransfers?.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <h3 className="text-sm font-semibold text-slate-800">
                  Ostatnio zrealizowane
                </h3>
                <ul className="mt-1 divide-y divide-slate-100">
                  {completedTransfers.slice(0, 5).map((transfer) => (
                    <li
                      key={transfer.id}
                      className="flex justify-between gap-3 py-1.5 text-xs text-slate-600"
                    >
                      <span>{transfer.fromName} → {transfer.toName}</span>
                      <span className="shrink-0">
                        {Number(transfer.amount).toFixed(2)} zł
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Dodaj wspólny wydatek</h2>
              <p className="mt-1 text-xs text-slate-600">
                Koszt zostanie podzielony po równo między zaznaczone osoby. Domyślnie
                zaznaczeni są wszyscy domownicy, a płatnikiem jesteś Ty.
              </p>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-3">
              <Input
                id="expense-description"
                label="Opis"
                placeholder="np. Netflix, środki czystości"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                maxLength="200"
                required
              />
              <Input
                id="expense-amount"
                label="Kwota (zł)"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="np. 59.99"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                required
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="expense-payer"
                  className="block text-sm font-semibold text-slate-900"
                >
                  Płatnik
                </label>
                <select
                  id="expense-payer"
                  value={expensePayerId}
                  onChange={(e) => setExpensePayerId(e.target.value)}
                  required
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="" disabled>Wybierz płatnika</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">
                  Uczestnicy (co najmniej jedna osoba)
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {members.map((member) => (
                    <label
                      key={member.userId}
                      className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={expenseParticipantIds.includes(member.userId)}
                        onChange={() => toggleExpenseParticipant(member.userId)}
                        className="h-4 w-4 accent-indigo-700"
                      />
                      <span className="truncate">{member.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {expenseError && (
                <p role="alert" className="text-sm font-semibold text-rose-700">
                  {expenseError}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={expenseSaving}>
                {expenseSaving ? 'Zapisywanie...' : 'Zapisz wydatek'}
              </Button>
            </form>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bilanse lokatorów</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Bilans uwzględnia kwoty zapłacone i udziały w wydatkach.
                </p>
              </div>
              {balances?.length ? (
                <ul className="divide-y divide-slate-200">
                  {balances.map((balance) => {
                    const amount = Number(balance.balance);
                    return (
                      <li
                        key={balance.userId}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                          {balance.name}
                        </span>
                        <span
                          className={`shrink-0 text-sm font-bold ${
                            amount > 0
                              ? 'text-emerald-700'
                              : amount < 0
                                ? 'text-rose-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {amount > 0 ? '+' : ''}{amount.toFixed(2)} zł
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">Brak bilansów do wyświetlenia.</p>
              )}
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Ostatnie wydatki</h2>
              {expenses?.length ? (
                <ul className="divide-y divide-slate-200">
                  {expenses.map((expense) => (
                    <li key={expense.id} className="space-y-1 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {expense.description}
                        </span>
                        <span className="font-bold text-slate-900">
                          {Number(expense.amount).toFixed(2)} zł
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Zapłacił: {expense.payerName}
                      </p>
                      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                        {expense.participants.map((participant) => (
                          <li key={participant.userId}>
                            {participant.name}: {Number(participant.amountOwed).toFixed(2)} zł
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">Nie dodano jeszcze wydatków.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Czynsz i rozliczenie</h2>
            <p className="mt-1 text-xs text-slate-600">
              Koszt jest dzielony proporcjonalnie do metrażu przypisanych pokoi. Zmiany
              czynszu, metrażu i przypisań obowiązują od następnego okresu.
            </p>
          </div>

          {isAdmin && (
            <form
              onSubmit={handleSaveRentSettings}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            >
              <Input
                id="rent-amount"
                label="Czynsz za okres (zł)"
                type="number"
                min="0.01"
                step="0.01"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                required
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="rent-cycle"
                  className="block text-sm font-semibold text-slate-900"
                >
                  Okres rozliczeniowy
                </label>
                <select
                  id="rent-cycle"
                  value={billingStartDay === '1' ? 'calendar' : 'custom'}
                  onChange={(e) =>
                    setBillingStartDay(e.target.value === 'calendar' ? '1' : '10')
                  }
                  disabled={Boolean(rent?.settings)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  <option value="calendar">Miesiąc kalendarzowy</option>
                  <option value="custom">Cykliczny od wybranego dnia</option>
                </select>
                {billingStartDay !== '1' && (
                  <Input
                    id="rent-cycle-start-day"
                    label="Dzień rozpoczęcia okresu (1–28)"
                    type="number"
                    min="1"
                    max="28"
                    value={billingStartDay}
                    onChange={(e) => setBillingStartDay(e.target.value)}
                    disabled={Boolean(rent?.settings)}
                    required
                  />
                )}
              </div>
              <Button type="submit" disabled={rentSaving}>
                {rentSaving ? 'Zapisywanie...' : rent?.settings ? 'Zmień czynsz' : 'Ustaw czynsz'}
              </Button>
              {rentError && (
                <p role="alert" className="text-sm font-semibold text-rose-700 sm:col-span-3">
                  {rentError}
                </p>
              )}
            </form>
          )}

          {rent?.currentPeriod ? (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Bieżący okres: {rent.currentPeriod.startsOn} – {rent.currentPeriod.endsOn}
                  </h3>
                  <p className="text-sm text-slate-700">
                    Czynsz: {Number(rent.currentPeriod.rentAmount).toFixed(2)} zł
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  Nieprzypisane pokoje nieuwzględnione: {rent.unassignedRoomCount}
                </p>
              </div>
              {rent.currentPeriod.excludedTenants?.length > 0 && (
                <ul className="space-y-1 text-xs text-amber-900">
                  {rent.currentPeriod.excludedTenants.map((tenant) => {
                    const assignedRoom = rooms.find((room) => room.tenantId === tenant.tenantId);
                    return (
                      <li
                        key={tenant.tenantId}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>Wyłączony z bieżącego czynszu: {tenant.tenantName}</span>
                        {isAdmin && assignedRoom && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-9 px-2.5 py-1 text-xs"
                            onClick={() =>
                              setRentAssignmentPrompt({
                                kind: 'current-period',
                                tenantId: tenant.tenantId,
                                roomId: assignedRoom.id,
                              })
                            }
                          >
                            Edytuj udział
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {rent.currentPeriod.allocations.length > 0 ? (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {rent.currentPeriod.allocations.map((allocation) => (
                    <li
                      key={allocation.tenantId}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-900">
                          {allocation.tenantName}
                        </span>
                        <span className="text-slate-600">
                          {' '}· {allocation.roomName}, {Number(allocation.area).toFixed(2)} m²
                          {' '}({Number(allocation.sharePercent).toFixed(2)}%)
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-slate-900">
                        {Number(allocation.amount).toFixed(2)} zł
                      </span>
                      {isAdmin && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-9 px-2.5 py-1 text-xs"
                          onClick={() =>
                            setRentAssignmentPrompt({
                              kind: 'current-period',
                              tenantId: allocation.tenantId,
                              roomId: allocation.roomId,
                            })
                          }
                        >
                          Edytuj udział
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status" className="text-sm text-slate-600">
                  Brak lokatorów uwzględnionych w bieżącym czynszu.
                </p>
              )}
            </div>
          ) : rent?.settings ? (
            <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Przypisz lokatora do co najmniej jednego pokoju, aby utworzyć rozliczenie czynszu.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Czynsz nie został jeszcze skonfigurowany.
            </p>
          )}
        </div>
      </Card>

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

      {rentAssignmentPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rent-assignment-title"
            aria-describedby="rent-assignment-description"
            className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-5 shadow-xl"
          >
            <h2 id="rent-assignment-title" className="text-lg font-bold text-slate-900">
              {rentAssignmentPrompt.kind === 'current-period'
                ? 'Zmień udział w bieżącym czynszu'
                : 'Uwzględnić lokatora w bieżącym czynszu?'}
            </h2>
            <p id="rent-assignment-description" className="mt-2 text-sm text-slate-700">
              {members.find((member) => member.userId === rentAssignmentPrompt.tenantId)?.name ||
                'Wybrany lokator'}
              {rentAssignmentPrompt.kind === 'current-period'
                ? ' pozostanie przypisany do pokoju. Wybierz, czy ma ponosić udział w czynszu za bieżący okres.'
                : ' zostanie przypisany do pokoju. Możesz uwzględnić go w podziale czynszu za bieżący okres albo przypisać do pokoju bez naliczania mu udziału w tym okresie. Od następnego okresu przypisani lokatorzy będą uwzględniani automatycznie.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRentAssignmentPrompt(null)}
                disabled={rentAssignmentSaving}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => chooseRentAssignment(false)}
                disabled={rentAssignmentSaving}
              >
                {rentAssignmentSaving
                  ? 'Zapisywanie...'
                  : rentAssignmentPrompt.kind === 'current-period'
                    ? 'Wyłącz z bieżącego czynszu'
                    : 'Przypisz bez bieżącego czynszu'}
              </Button>
              <Button
                type="button"
                onClick={() => chooseRentAssignment(true)}
                disabled={rentAssignmentSaving}
              >
                {rentAssignmentSaving ? 'Zapisywanie...' : 'Uwzględnij w czynszu'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}