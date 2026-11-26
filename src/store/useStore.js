import { useState, useEffect } from 'react';

const STORAGE_KEY = 'rent_manager_slate_v1';

const initialState = {
  rooms: [],
  tenants: [],
  bills: [],
};

export function useStore() {
  const [db, setDb] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : initialState;
    } catch {
      return initialState;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Błąd zapisu stanu:', e);
    }
  }, [db]);

  const resetDb = () => setDb(initialState);

  // TODO (os2): Tutaj dopisuj kolejne akcje i operacje na stanie, np.:
  // const addRoom = (name, area) => { ... };
  // const assignTenant = (roomId, tenantId) => { ... };

  return {
    db,
    setDb,
    resetDb,
  };
}
