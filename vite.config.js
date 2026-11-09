import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site works both at a domain root and
  // under a sub-path such as https://<user>.github.io/gta-vi-countdown/
  base: './',
})
