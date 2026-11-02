import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Where `/api/*` is forwarded in development. The default is the Django
  // process on port 8000; point it elsewhere to run the ASGI server (daphne,
  // which is what carries the messaging WebSocket) beside a dev server that is
  // already on 8000:
  //   VITE_PROXY_TARGET=http://127.0.0.1:8010 npm run dev -- --port 5199
  // A shell prefix wins over frontend/.env, so a one-off run cannot be
  // overridden by a file left behind by the last one.
  const BACKEND =
    process.env.VITE_PROXY_TARGET ||
    loadEnv(mode, process.cwd()).VITE_PROXY_TARGET ||
    'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        // All /api/* requests during development are forwarded to Django.
        // `ws` carries the messaging socket (/api/ws/messaging/) over the same
        // origin so the dev server never has to be in the CSRF trusted list.
        '/api': {
          target: BACKEND,
          changeOrigin: true,
          ws: true,
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
  }
})
