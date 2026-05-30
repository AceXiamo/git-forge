import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    outDir: 'dist/webview/details',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        conflicts: 'src/webview/conflicts/main.tsx',
        details: 'src/webview/details/main.tsx',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.some(name => name.endsWith('.css')))
            return 'details.css'
          return 'assets/[name][extname]'
        },
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
})
