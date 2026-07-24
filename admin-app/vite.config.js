import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El panel se sirve tras la ruta secreta; los assets van bajo /api/admin/static/
// (que Vercel ya proxya a Railway). El build sale a ../server/admin-dist para
// que Railway lo incluya (Railway solo despliega server/).
export default defineConfig({
  plugins: [react()],
  base: '/api/admin/static/',
  build: {
    outDir: '../server/admin-dist',
    emptyOutDir: true,
  },
});
