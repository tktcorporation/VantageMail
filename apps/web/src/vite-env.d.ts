/// <reference types="vite/client" />

/**
 * Vite 環境変数の型定義。
 * import.meta.env.VITE_xxx の型補完を有効にする。
 */
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_OAUTH_REDIRECT_URI: string;
  readonly VITE_OAUTH_PROXY_URL: string;
  readonly VITE_PUBSUB_TOPIC: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
