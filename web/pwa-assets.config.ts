import {
  defineConfig,
  minimal2023Preset as preset,
} from '@vite-pwa/assets-generator/config'

// Generates the standard PWA icon set from public/icon.svg.
// Run after editing icon.svg:  npm run generate-pwa-assets
//
// We override the maskable variant to bake navy (#13294B) into the padding
// rather than leaving it transparent. Some Android launchers render
// transparent padding as white when masking — this guarantees the brand
// color is what shows behind the text, regardless of launcher.
const NAVY = { r: 0x13, g: 0x29, b: 0x4b, alpha: 1 } as const

export default defineConfig({
  preset: {
    ...preset,
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: {
        background: NAVY,
      },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: {
        background: NAVY,
      },
    },
  },
  images: ['public/icon.svg'],
})
