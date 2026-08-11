import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['5173-icisy1d7l5uyxrtphzf1m-15b0c320.us2.manus.computer'],
  },
})
