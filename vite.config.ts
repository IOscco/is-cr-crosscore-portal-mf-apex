import { defineConfig, type UserConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import vitePluginSingleSpa from 'vite-plugin-single-spa';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const PORT = 9025;
const DEV_ORIGIN = `http://localhost:${PORT}`;

export default defineConfig(({ command }): UserConfig => ({
  base: command === 'serve' ? `${DEV_ORIGIN}/` : '/',
  resolve: {
    alias: [{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer] as any[],
    },
  },
  plugins: [
    cssInjectedByJsPlugin({ dev: { enableDev: true } }),
    vue(),
    vitePluginSingleSpa({
      type: 'mife',
      serverPort: PORT,
      spaEntryPoints: 'src/main.ts',
    }),
  ],
  server: {
    host: true,
    port: PORT,
    strictPort: true,
    origin: DEV_ORIGIN,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'main.js',
      },
    },
  },
}));
