import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// P029 TableFork — T001 scaffold. No remote fonts, no CDN, no external assets.
export default defineConfig({
  plugins: [react()],
});
