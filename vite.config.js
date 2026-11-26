import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (mode === 'production') {
    let apiUrl;
    try {
      apiUrl = new URL(env.VITE_API_URL);
    } catch {
      throw new Error('Dla buildu produkcyjnego ustaw VITE_API_URL na adres HTTPS API.');
    }

    if (apiUrl.protocol !== 'https:') {
      throw new Error('Produkcyjny VITE_API_URL musi używać HTTPS.');
    }
  }

  return {
    plugins: [react()],
  };
});
