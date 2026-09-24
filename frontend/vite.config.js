import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/chat-app/',
  plugins: [react(), basicSsl()],
  server: {
    host: true, // Exposes the server to your local network
  }
})
