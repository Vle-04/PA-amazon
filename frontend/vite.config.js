import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite serves the app on :5173 and proxies API and image requests to the backend on :3000.
// Build: output goes to frontend/dist, which the backend serves in production.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000' },
  },
});
