import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative assets work locally and leave the repository path configurable for hosting later.
  base: './',
});
