import { useState, useEffect } from 'react';

const STORAGE_KEY = 'lokatorpay_slate_v1';

const initialState = {
  rooms: [],
  tenants: [],
  meters: [],
  expenses: [],
};

export function useStore() {
  const [db, setDb] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
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

  return {
    db,
    setDb,
    resetDb,
  };
}