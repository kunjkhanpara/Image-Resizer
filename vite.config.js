import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Image-Resizer/', // IMPORTANT: must match your GitHub repo name
})
