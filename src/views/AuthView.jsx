import React, { useState } from 'react';
import { Card, Button, Input, Badge } from '../components/ui';

export function AuthView({ store }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await store.registerUser({ name, email, password });
      } else {
        await store.loginUser({ email, password });
      }
    } catch (err) {
      setError(err.message || 'Wystąpił błąd uwierzytelniania.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center px-3 sm:px-6 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1.5">
          <Badge variant="primary">LokatorPay</Badge>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'login' ? 'Zaloguj się do mieszkania' : 'Załóż konto lokatora'}
          </h1>
          <p className="text-sm text-slate-700">
            {mode === 'login'
              ? 'Uzyskaj dostęp do podziału czynszu, liczników i bilansu.'
              : 'Dołącz do rozliczeń lokalu z pełną przejrzystością kosztów.'}
          </p>
        </div>

        <Card>
          <div
            role="tablist"
            aria-label="Tryb uwierzytelniania"
            className="grid grid-cols-2 gap-1.5 bg-slate-200 p-1 rounded-lg mb-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`min-h-[44px] text-sm font-semibold rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Logowanie
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => switchMode('register')}
              className={`min-h-[44px] text-sm font-semibold rounded-md transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Rejestracja
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <Input
                id="auth-name"
                label="Imię lub pseudonim"
                type="text"
                placeholder="np. Anna"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            )}

            <Input
              id="auth-email"
              label="Adres e-mail"
              type="email"
              placeholder="lokator@przyklad.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <Input
              id="auth-password"
              label="Hasło"
              type="password"
              placeholder="Minimum 8 znaków"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={
                mode === 'register'
                  ? 'Min. 8 znaków, 1 wielka litera, 1 cyfra oraz 1 znak specjalny.'
                  : undefined
              }
              required
            />

            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm font-semibold text-rose-800"
              >
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? 'Przetwarzanie...'
                : mode === 'login'
                ? 'Zaloguj się'
                : 'Utwórz konto'}
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-slate-600">
            Sesja zabezpieczona tokenem JWT ważnym przez 60 minut (HTTPS).
          </p>
        </Card>
      </div>
    </div>
  );
}