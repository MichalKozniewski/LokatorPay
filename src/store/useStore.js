import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'lokatorpay_access_token_v1';
const PENDING_INVITE_KEY = 'lokatorpay_pending_invite_v1';
const ACTIVE_APT_KEY = 'lokatorpay_active_apartment_v1';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLocalHostname(hostname) {
  return LOCAL_HOSTS.has(hostname);
}

function assertSecureTransport(apiUrl) {
  let parsedApi;
  try {
    parsedApi = new URL(apiUrl);
  } catch {
    throw new Error('Nieprawidłowy adres serwera API (VITE_API_URL).');
  }

  if (parsedApi.protocol !== 'https:' && !isLocalHostname(parsedApi.hostname)) {
    throw new Error(
      `Niezabezpieczone połączenie z API (${parsedApi.origin}). Wymagany protokół HTTPS.`
    );
  }

  if (
    typeof window !== 'undefined' &&
    window.location.protocol !== 'https:' &&
    !isLocalHostname(window.location.hostname)
  ) {
    throw new Error('Aplikacja wymaga uruchomienia przez szyfrowany protokół HTTPS.');
  }
}

function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch {
    return null;
  }
}

export function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return 'Hasło musi mieć co najmniej 8 znaków.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Hasło musi zawierać co najmniej jedną wielką literę.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Hasło musi zawierać co najmniej jedną cyfrę.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Hasło musi zawierać co najmniej jeden znak specjalny (np. !@#$).';
  }
  return null;
}

export function useStore() {
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return null;
    const payload = parseJwtPayload(saved);
    if (!payload || payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return saved;
  });

  const [user, setUser] = useState(null);
  const [apartments, setApartments] = useState([]);
  const [activeApartmentId, setActiveApartmentId] = useState(
    () => localStorage.getItem(ACTIVE_APT_KEY) || null
  );
  const [scopedData, setScopedData] = useState({
    apartment: null,
    role: null,
    members: [],
    rooms: [],
    totalArea: 0,
    invites: [],
    rent: null,
    meters: [],
    expenses: [],
    balances: [],
    suggestedTransfers: [],
    completedTransfers: [],
  });
  const [loading, setLoading] = useState(Boolean(token));
  const [inviteBanner, setInviteBanner] = useState(null);

  const [pendingInviteToken, setPendingInviteToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('invite');
    if (fromUrl) {
      localStorage.setItem(PENDING_INVITE_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(PENDING_INVITE_KEY) || null;
  });

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVE_APT_KEY);
    setToken(null);
    setUser(null);
    setApartments([]);
    setActiveApartmentId(null);
    setScopedData({
      apartment: null,
      role: null,
      members: [],
      rooms: [],
      totalArea: 0,
      invites: [],
      rent: null,
      meters: [],
      expenses: [],
      balances: [],
      suggestedTransfers: [],
      completedTransfers: [],
    });
  }, []);

  const apiFetch = useCallback(
    async (path, options = {}, overrideToken = null) => {
      assertSecureTransport(API_URL);
      const activeToken = overrideToken || token;
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      if (activeToken) {
        headers.Authorization = `Bearer ${activeToken}`;
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        logout();
        throw new Error(data.detail || 'Sesja wygasła. Zaloguj się ponownie.');
      }

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg).join(', ')
          : data.detail;
        throw new Error(detail || 'Wystąpił błąd komunikacji z serwerem.');
      }

      return data;
    },
    [token, logout]
  );

  // Automatyczne wylogowanie dokładnie po wygaśnięciu JWT (60 min)
  useEffect(() => {
    if (!token) return;
    const payload = parseJwtPayload(token);
    if (!payload?.exp) {
      logout();
      return;
    }
    const remainingMs = payload.exp * 1000 - Date.now();
    if (remainingMs <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(() => {
      logout();
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [token, logout]);

  const clearPendingInvite = useCallback(() => {
    localStorage.removeItem(PENDING_INVITE_KEY);
    setPendingInviteToken(null);
    if (window.location.search.includes('invite=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const loadApartmentDetails = useCallback(
    async (aptId, overrideToken = null) => {
      const details = await apiFetch(`/api/apartments/${aptId}`, {}, overrideToken);
      setScopedData((prev) => ({
        ...prev,
        ...details,
        meters: prev.meters || [],
      }));
      setActiveApartmentId(aptId);
      localStorage.setItem(ACTIVE_APT_KEY, aptId);
    },
    [apiFetch]
  );

  // Inicjalizacja sesji po odświeżeniu strony lub zalogowaniu
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function bootstrapSession() {
      setLoading(true);
      try {
        const me = await apiFetch('/api/auth/me');
        if (cancelled) return;
        setUser(me);

        // Jeśli użytkownik wszedł z linku zaproszeniowego, realizujemy zaproszenie w backendzie
        if (pendingInviteToken) {
          try {
            const joined = await apiFetch(`/api/apartments/join/${encodeURIComponent(pendingInviteToken)}`, {
              method: 'POST',
            });
            if (!cancelled) {
              setScopedData((prev) => ({ ...prev, ...joined }));
              setActiveApartmentId(joined.apartment.id);
              localStorage.setItem(ACTIVE_APT_KEY, joined.apartment.id);
              setInviteBanner({
                type: 'success',
                message: `Dołączono do lokalu: ${joined.apartment.name}`,
              });
            }
          } catch (inviteErr) {
            if (!cancelled) {
              setInviteBanner({ type: 'error', message: inviteErr.message });
            }
          } finally {
            if (!cancelled) clearPendingInvite();
          }
        }

        const aptList = await apiFetch('/api/apartments');
        if (cancelled) return;
        setApartments(aptList);

        if (aptList.length > 0) {
          const preferredId =
            aptList.find((a) => a.id === localStorage.getItem(ACTIVE_APT_KEY))?.id ||
            aptList[0].id;
          await loadApartmentDetails(preferredId);
        }
      } catch {
        // Błąd 401 wywoła logout() wewnątrz apiFetch
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrapSession();
    return () => {
      cancelled = true;
    };
  }, [token, apiFetch, pendingInviteToken, clearPendingInvite, loadApartmentDetails]);

  const registerUser = async ({ name, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('Podaj poprawny adres e-mail.');
    }
    const pwdError = validatePasswordStrength(password);
    if (pwdError) throw new Error(pwdError);

    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email: normalizedEmail, password }),
    });

    localStorage.setItem(TOKEN_KEY, res.access_token);
    setUser(res.user);
    setToken(res.access_token);
  };

  const loginUser = async ({ email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password }),
    });

    localStorage.setItem(TOKEN_KEY, res.access_token);
    setUser(res.user);
    setToken(res.access_token);
  };

  const createApartment = async ({ name, address }) => {
    const created = await apiFetch('/api/apartments', {
      method: 'POST',
      body: JSON.stringify({ name, address }),
    });
    setScopedData((prev) => ({ ...prev, ...created }));
    setActiveApartmentId(created.apartment.id);
    localStorage.setItem(ACTIVE_APT_KEY, created.apartment.id);
    const aptList = await apiFetch('/api/apartments');
    setApartments(aptList);
    return created;
  };

  const joinApartmentByToken = async (rawInput) => {
    const trimmed = (rawInput || '').trim();
    if (!trimmed) {
      throw new Error('Wklej link zaproszeniowy lub kod zaproszenia.');
    }

    let extractedToken = trimmed;
    if (trimmed.includes('invite=')) {
      try {
        const parsed = new URL(trimmed, window.location.origin);
        extractedToken = parsed.searchParams.get('invite') || trimmed;
      } catch {
        const match = trimmed.match(/[?&]invite=([^&#]+)/);
        if (match) extractedToken = decodeURIComponent(match[1]);
      }
    }

    const joined = await apiFetch(`/api/apartments/join/${encodeURIComponent(extractedToken)}`, {
      method: 'POST',
    });

    setScopedData((prev) => ({ ...prev, ...joined }));
    setActiveApartmentId(joined.apartment.id);
    localStorage.setItem(ACTIVE_APT_KEY, joined.apartment.id);

    const aptList = await apiFetch('/api/apartments');
    setApartments(aptList);

    return joined;
  };

  const switchApartment = async (apartmentId) => {
    await loadApartmentDetails(apartmentId);
  };

  const createInvite = async ({ apartmentId, email = '' }) => {
    return apiFetch(`/api/apartments/${apartmentId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() || null }),
    });
  };

  const removeApartmentMember = async ({ apartmentId, userId }) => {
    const updated = await apiFetch(
      `/api/apartments/${apartmentId}/members/${userId}`,
      { method: 'DELETE' }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const transferApartmentAdmin = async ({ apartmentId, userId }) => {
    const updated = await apiFetch(
      `/api/apartments/${apartmentId}/transfer-admin`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
    setApartments(await apiFetch('/api/apartments'));
  };

  const leaveApartment = async ({ confirmEmptyApartment = false } = {}) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const confirmationQuery = confirmEmptyApartment
      ? '?confirm_empty_apartment=true'
      : '';
    await apiFetch(`/api/apartments/${activeApartmentId}/leave${confirmationQuery}`, {
      method: 'DELETE',
    });

    const remainingApartments = await apiFetch('/api/apartments');
    setApartments(remainingApartments);
    if (remainingApartments.length > 0) {
      await loadApartmentDetails(remainingApartments[0].id);
      return;
    }

    setActiveApartmentId(null);
    localStorage.removeItem(ACTIVE_APT_KEY);
    setScopedData({
      apartment: null,
      role: null,
      members: [],
      rooms: [],
      totalArea: 0,
      invites: [],
      rent: null,
      meters: [],
      expenses: [],
      balances: [],
      suggestedTransfers: [],
      completedTransfers: [],
    });
  };

  const deleteAccount = async () => {
    await apiFetch('/api/auth/me', { method: 'DELETE' });
    logout();
  };

  const addRoom = async ({
    name,
    area,
    tenantId = null,
    includeInCurrentRent = true,
  }) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const numericArea = Number(area);
    if (!Number.isFinite(numericArea) || numericArea <= 0) {
      throw new Error('Metraż pokoju musi być wartością dodatnią większą od 0 m².');
    }

    const updated = await apiFetch(`/api/apartments/${activeApartmentId}/rooms`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        area: numericArea,
        tenant_user_id: tenantId || null,
        include_in_current_rent: includeInCurrentRent,
      }),
    });
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const assignTenantToRoom = async ({
    roomId,
    tenantId,
    includeInCurrentRent = true,
  }) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const updated = await apiFetch(
      `/api/apartments/${activeApartmentId}/rooms/${roomId}/assign`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          tenant_user_id: tenantId || null,
          include_in_current_rent: includeInCurrentRent,
        }),
      }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const updateRoom = async ({ roomId, name, area }) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const trimmedName = name.trim();
    const numericArea = Number(area);
    if (!trimmedName) throw new Error('Podaj nazwę pokoju.');
    if (!Number.isFinite(numericArea) || numericArea < 0.01 || numericArea > 9999.99) {
      throw new Error('Metraż pokoju musi wynosić od 0,01 do 9999,99 m².');
    }

    const updated = await apiFetch(
      `/api/apartments/${activeApartmentId}/rooms/${roomId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmedName, area: numericArea }),
      }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const removeRoom = async (roomId) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const updated = await apiFetch(
      `/api/apartments/${activeApartmentId}/rooms/${roomId}`,
      { method: 'DELETE' }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const saveRentSettings = async ({ rentAmount, billingStartDay }) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const updated = await apiFetch(
      `/api/apartments/${activeApartmentId}/rent/settings`,
      {
        method: 'PUT',
        body: JSON.stringify({
          rent_amount: Number(rentAmount),
          billing_start_day: Number(billingStartDay),
        }),
      }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const addExpense = async ({
    description,
    amount,
    payerUserId,
    participantUserIds,
  }) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const updated = await apiFetch(
      `/api/apartments/${activeApartmentId}/expenses`,
      {
        method: 'POST',
        body: JSON.stringify({
          description,
          amount: Number(amount),
          payer_user_id: payerUserId,
          participant_user_ids: participantUserIds,
        }),
      }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  const completeSuggestedTransfer = async ({ recipientUserId, amount }) => {
    if (!activeApartmentId) throw new Error('Brak wybranego lokalu.');
    const updated = await apiFetch(
      `/api/apartments/${activeApartmentId}/settlements/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          recipient_user_id: recipientUserId,
          amount: Number(amount),
        }),
      }
    );
    setScopedData((prev) => ({ ...prev, ...updated }));
  };

  return {
    session: token && user ? { token, user } : null,
    loading,
    inviteBanner,
    clearInviteBanner: () => setInviteBanner(null),
    apartments,
    activeApartmentId,
    switchApartment,
    scopedData,
    registerUser,
    loginUser,
    logout,
    createApartment,
    joinApartmentByToken,
    createInvite,
    removeApartmentMember,
    transferApartmentAdmin,
    leaveApartment,
    deleteAccount,
    addRoom,
    assignTenantToRoom,
    updateRoom,
    removeRoom,
    saveRentSettings,
    addExpense,
    completeSuggestedTransfer,
  };
}