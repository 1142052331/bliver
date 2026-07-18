import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5100',
      '/socket.io': {
        target: 'http://localhost:5100',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
