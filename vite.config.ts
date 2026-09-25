import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  // The root .env belongs to the server. Do not let NODE_ENV=development there
  // turn a production frontend build into React's development distribution.
  envDir: 'client',
  plugins: [react(), tailwind()],
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          forms: ['zod', 'react-hook-form', '@hookform/resolvers/zod'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
