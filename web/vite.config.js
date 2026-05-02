import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/diarize": "http://localhost:8000",
            "/speakers": "http://localhost:8000",
            "/examples": "http://localhost:8000",
            "/health": "http://localhost:8000",
        },
    },
});
