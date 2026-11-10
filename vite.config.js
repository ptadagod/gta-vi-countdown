import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site works both at a domain root and
  // under a sub-path such as https://<user>.github.io/gta-vi-countdown/
  base: './',
  build: {
    chunkSizeWarningLimit: 1200, // MapLibre alone is ~1 MB
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        minimap: resolve(import.meta.dirname, 'minimap/index.html'),
        billion: resolve(import.meta.dirname, 'billion/index.html'),
      },
    },
  },
})
