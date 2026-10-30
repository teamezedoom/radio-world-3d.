import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Rutas relativas: permite desplegar el build en cualquier subcarpeta o CDN estático.
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('globe')) return 'globe'
          if (id.includes('node_modules/hls.js')) return 'hls'
        },
      },
    },
  },
})
