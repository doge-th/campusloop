import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is the GitHub Pages project path so the built site works from
// https://doge-th.github.io/campusloop/ without extra redirects.
export default defineConfig({
  base: '/campusloop/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
})
