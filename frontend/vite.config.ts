import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5123,
    proxy: {
      '/api': {
        target: 'http://localhost:5007',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5007',
        changeOrigin: true,
      }
    }
  }
});
