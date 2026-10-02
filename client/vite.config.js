import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1, not localhost: the API listens on IPv4 loopback only.
      '/api': process.env.API_URL || 'http://127.0.0.1:4000',
    },
  },
});
