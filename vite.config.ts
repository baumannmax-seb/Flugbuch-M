import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' damit die App auch aus einem Unterordner (GitHub Pages, Capacitor) läuft
export default defineConfig({
  base: './',
  plugins: [react()],
});
