import { interseguroTailwindPreset } from 'is-uikit-components-vue/tailwind';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [interseguroTailwindPreset],
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
