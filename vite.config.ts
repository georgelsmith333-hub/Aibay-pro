import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['5173-icisy1d7l5uyxrtphzf1m-15b0c320.us2.manus.computer'],
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Long-lived vendor chunks: cached independently of app changes.
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('/react') || id.includes('/react-dom') || id.includes('/scheduler') || id.includes('/clsx')) return 'react'
          return undefined
        },
      },
    },
  },
})
