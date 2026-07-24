import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El panel se sirve tras una ruta ofuscada; los assets van bajo /x/static/
// (que Vercel ya proxya a Railway vía /x/:path*). El build sale a
// ../server/admin-dist para que Railway lo incluya (Railway solo despliega server/).
export default defineConfig({
  plugins: [react()],
  base: '/x/static/',
  build: {
    outDir: '../server/admin-dist',
    emptyOutDir: true,
  },
});
