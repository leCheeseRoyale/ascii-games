import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'engine'),
      '@game': resolve(__dirname, 'game'),
      '@ui': resolve(__dirname, 'ui'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    target: 'esnext',
  },
})
