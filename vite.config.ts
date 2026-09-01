import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Google Identity Services only works on an origin registered in Google Cloud.
  // Failing loudly on a taken port beats silently serving from 5174, where the
  // sign-in button dies with nothing but a console message.
  server: {
    port: 5173,
    strictPort: true,
  },
})
