import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  },
  // Testes de fumaça das telas (npm test): navegador simulado com jsdom
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js']
  }
})
