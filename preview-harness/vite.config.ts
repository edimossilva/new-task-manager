import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * Lifts the font `<link>`s out of the app's own index.html into the harness page.
 *
 * Copying them by hand is how the harness ended up rendering every screenshot in
 * fallback faces while looking plausible -- type weight and character judgements
 * made against it were simply wrong. Reading the real file means the two cannot
 * drift.
 */
function appFontLinks(): Plugin {
  return {
    name: 'harness-app-font-links',
    transformIndexHtml(html) {
      const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
      const links = source.match(/<link rel="preconnect"[\s\S]*?rel="stylesheet"\s*\/>/)?.[0]
      if (!links) throw new Error('Could not find the font links in index.html')
      return html.replace('</head>', `${links}\n  </head>`)
    },
  }
}

export default defineConfig({
  root,
  plugins: [vue(), tailwindcss(), appFontLinks()],
  resolve: {
    alias: [
      // Everything downstream -- stores, use cases, views -- runs untouched.
      {
        find: /^@\/adapters\/repositories$/,
        replacement: fileURLToPath(new URL('./repositories.ts', import.meta.url)),
      },
      { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
    ],
  },
  server: { port: 5199, open: '/preview-harness/' },
})
