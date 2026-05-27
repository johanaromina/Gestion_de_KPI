import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('recharts')) return 'charts'
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) return 'forms'
          if (
            id.includes('i18next') ||
            id.includes('react-i18next') ||
            id.includes('react-query') ||
            id.includes('axios')
          ) {
            return 'data-core'
          }
          if (
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('/react/')
          ) {
            return 'react-core'
          }
          if (id.includes('date-fns')) return 'date-utils'
          if (id.includes('react-organizational-chart')) return 'org-chart'

          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
