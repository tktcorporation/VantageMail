import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          output: {
            /**
             * SSR チャンクのファイル名からハッシュを除去する。
             *
             * 背景: rolldown v0.x に、ハッシュプレースホルダー置換時に
             * マルチバイト UTF-8 文字のバイト境界でパニックするバグがある。
             * SSR チャンクはサーバー内部でのみ使われキャッシュバスティング不要のため、
             * ハッシュを含めないことでこの問題を回避する。
             * ref: https://github.com/rolldown/rolldown/issues
             */
            chunkFileNames: "[name].js",
            entryFileNames: "[name].js",
          },
        },
      },
    },
  },
});
