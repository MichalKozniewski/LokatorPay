import React, { useState } from 'react';
import { Card, PageHeader, Button, Input, Badge } from '../components/ui';

export function OnboardingApartmentView({ store }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [submittingJoin, setSubmittingJoin] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSubmittingCreate(true);
    try {
      await store.createApartment({ name, address });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleJoinByLink = async (e) => {
    e.preventDefault();
    setInviteError('');
    setSubmittingJoin(true);
    try {
      await store.joinApartmentByToken(inviteCode);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setSubmittingJoin(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        badge="Konfiguracja Lokalu"
        title="Załóż lokal lub dołącz do współlokatorów"
        description="Aby korzystać z rozliczeń, utwórz nowe mieszkanie jako Administrator lub wklej link otrzymany od współlokatora."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <div className="space-y-4">
            <div className="space-y-1">
              <Badge variant="primary">Rola: Administrator lokalu</Badge>
              <h2 className="text-lg font-bold text-slate-900 pt-1">Nowy lokal</h2>
              <p className="text-sm text-slate-700">
                Utwórz mieszkanie, zdefiniuj pokoje i wygeneruj zaproszenia dla lokatorów.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                id="apt-name"
                label="Nazwa lokalu"
                placeholder="np. Mieszkanie Słoneczna 12/4"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                id="apt-address"
                label="Adres (opcjonalnie)"
                placeholder="np. ul. Słoneczna 12/4, Olsztyn"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              {error && (
                <p role="alert" className="text-xs font-semibold text-rose-700">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={submittingCreate}>
                {submittingCreate ? 'Tworzenie lokalu...' : 'Załóż lokal jako Administrator'}
              </Button>
            </form>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <div className="space-y-1">
              <Badge variant="neutral">Rola: Lokator</Badge>
              <h2 className="text-lg font-bold text-slate-900 pt-1">Masz zaproszenie?</h2>
              <p className="text-sm text-slate-700">
                Kliknij otrzymany link lub wklej go poniżej, aby dołączyć do właściwego mieszkania.
              </p>
            </div>

            <form onSubmit={handleJoinByLink} className="space-y-4">
              <Input
                id="apt-invite"
                label="Link lub kod zaproszenia"
                placeholder="http://localhost:5173/?invite=..."
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              {inviteError && (
                <p role="alert" className="text-xs font-semibold text-rose-700">
                  {inviteError}
                </p>
              )}
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                disabled={submittingJoin}
              >
                {submittingJoin ? 'Dołączanie...' : 'Dołącz do lokalu'}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}