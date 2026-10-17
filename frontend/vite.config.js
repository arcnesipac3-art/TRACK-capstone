import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /api/* requests during development are forwarded to Django
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    // Restore module state (e.g. the API client's memoised CSRF promise)
    // between files so tests cannot leak into each other.
    restoreMocks: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
