import React, { useState } from 'react';
import { Card, PageHeader, Button, Input, Badge } from '../components/ui';

export function TenantsView({ store }) {
  const { apartment, role, members, invites } = store.scopedData;
  const isAdmin = role === 'admin';

  const [inviteEmail, setInviteEmail] = useState('');
  const [lastInvite, setLastInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    setError('');
    setCopied(false);

    try {
      const invite = await store.createInvite({
        apartmentId: apartment.id,
        email: inviteEmail,
      });
      setLastInvite(invite);
      setInviteEmail('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyLink = async () => {
    if (!lastInvite?.link) return;
    try {
      await navigator.clipboard.writeText(lastInvite.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const buildMailtoHref = (invite) => {
    const subject = encodeURIComponent(`Zaproszenie do lokalu ${apartment.name} w LokatorPay`);
    const body = encodeURIComponent(
      `Cześć!\n\nZapraszam Cię do wspólnych rozliczeń lokalu "${apartment.name}" w aplikacji LokatorPay.\nKliknij poniższy jednorazowy link, aby dołączyć:\n${invite.link}`
    );
    return `mailto:${invite.email || ''}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        badge={`Lokal: ${apartment.name}`}
        title="Lokatorzy i zaproszenia"
        description="Lista współlokatorów przypisanych wyłącznie do tego mieszkania."
      />

      {isAdmin && (
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Zaproś współlokatora
                </h2>
                <p className="text-sm text-slate-700">
                  Wygeneruj jednorazowy link zaproszeniowy do wysłania na czacie lub e-mailem.
                </p>
              </div>
              <Badge variant="primary">Administrator lokalu</Badge>
            </div>

            <form
              onSubmit={handleGenerateInvite}
              className="flex flex-col sm:flex-row sm:items-end gap-3"
            >
              <div className="flex-1">
                <Input
                  id="invite-email"
                  label="Adres e-mail współlokatora (opcjonalnie)"
                  type="email"
                  placeholder="wspollokator@przyklad.pl"
                  hint="Jeśli podasz e-mail, link będzie przypisany wyłącznie do tego adresu."
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="sm:w-auto w-full">
                Generuj jednorazowy link
              </Button>
            </form>

            {error && (
              <p role="alert" className="text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}

            {lastInvite && (
              <div className="p-3.5 rounded-lg bg-slate-100 border border-slate-300 space-y-3">
                <p className="text-xs font-semibold text-emerald-900">
                  Wygenerowano jednorazowy link zaproszeniowy
                  {lastInvite.email ? ` dla adresu ${lastInvite.email}` : ''}.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={lastInvite.link}
                    aria-label="Jednorazowy link zaproszeniowy"
                    className="flex-1 min-h-[44px] px-3 py-2 text-xs sm:text-sm font-mono bg-white border border-slate-400 rounded-lg text-slate-900"
                  />
                  <Button type="button" variant="secondary" onClick={handleCopyLink}>
                    {copied ? 'Skopiowano!' : 'Kopiuj link'}
                  </Button>
                  {lastInvite.email && (
                    <a
                      href={buildMailtoHref(lastInvite)}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 inline-flex items-center justify-center text-center"
                    >
                      Wyślij e-mailem
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Członkowie lokalu ({members.length})
          </h2>

          <ul className="divide-y divide-slate-200">
            {members.map((member) => (
              <li
                key={member.userId}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 break-words">{member.name}</p>
                  <p className="text-xs text-slate-700 break-all">{member.email}</p>
                </div>
                <div className="shrink-0">
                  <Badge variant={member.role === 'admin' ? 'primary' : 'neutral'}>
                    {member.role === 'admin' ? 'Administrator' : 'Lokator'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>

          {isAdmin && invites.length > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                Historia zaproszeń ({invites.length})
              </h3>
              <ul className="space-y-1.5 text-xs text-slate-800">
                {invites.map((inv) => (
                  <li
                    key={inv.token}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-slate-50 px-3 py-2 rounded-lg border border-slate-300"
                  >
                    <span className="font-mono break-all">
                      Kod: <strong>{inv.token}</strong>
                      {inv.email ? ` • ${inv.email}` : ' • link ogólny'}
                    </span>
                    <span className="font-semibold shrink-0">
                      {inv.used ? 'Wykorzystane' : 'Aktywne (1 użycie)'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}