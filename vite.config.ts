import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import http from 'http';
import path from 'path';
import {defineConfig, type ProxyOptions} from 'vite';

// All /api calls go to the FastAPI backend (same origin, so the session cookie just works).
const apiProxy: ProxyOptions = {
  target: process.env.EDUMATCH_API_URL || 'http://127.0.0.1:8010',
  changeOrigin: true,
  // Node keeps upstream sockets alive by default, but uvicorn closes idle ones after 5 s. Reusing a socket
  // uvicorn just closed gives ECONNRESET, and the browser request then hangs. Use a fresh connection each time.
  agent: new http.Agent({ keepAlive: false }),
  configure: proxy => {
    // Never leave the browser waiting: turn any proxy failure into a JSON error the UI can show.
    proxy.on('error', (err, _req, res) => {
      if (res && 'writeHead' in res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'BACKEND_UNREACHABLE', message: `Backend unreachable: ${err.message}`, details: null }));
      }
    });
  }
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    preview: {
      port: 3000,
      proxy: { '/api': apiProxy }
    },
    server: {
      port: 3000,
      proxy: { '/api': apiProxy },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
