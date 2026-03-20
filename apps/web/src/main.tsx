/**
 * Web版エントリーポイント。
 *
 * 背景: Cloudflare Pages向けのWebアプリのブートストラップ。
 * @vantagemail/ui の App コンポーネントをマウントする。
 * プラットフォーム固有のアダプター（Web Crypto, IndexedDB等）は
 * 将来 platform-web パッケージに分離する。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@vantagemail/ui";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 要素が見つかりません");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
