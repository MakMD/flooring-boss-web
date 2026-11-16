import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^.*\/supabaseClient(?:\.js)?$/, replacement: fileURLToPath(new URL('./supabaseMock.js', import.meta.url)) }] },
  server: { host: 'localhost', port: 5176, strictPort: true },
});
