import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Phase 1 requires no public environment variables. Never expose provider credentials.
  if (Object.keys(loadEnv(mode, process.cwd(), 'VITE_')).length) {
    throw new Error(
      'Client environment variables are disabled in Phase 1. Keep credentials server-side; remove VITE_ variables.',
    )
  }
  return {
    server: {
      strictPort: true,
      proxy: { '/api/searchad': { target: 'http://127.0.0.1:4179', changeOrigin: true } },
    },
    plugins: [
      react(),
      {
        name: 'server-boundary',
        load(id: string) {
          if (id.replaceAll('\\', '/').includes('/server/'))
            throw new Error('Server modules cannot be imported into the browser bundle.')
        },
      },
    ],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: './src/test/setup.ts',
      restoreMocks: true,
      css: false,
    },
  }
})
