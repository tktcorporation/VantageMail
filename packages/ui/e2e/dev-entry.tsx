/**
 * スクリーンショット撮影用のスタンドアロンエントリーポイント。
 *
 * 背景: apps/web の TanStack Start / Cloudflare Workers 環境を使わずに
 * packages/ui の App コンポーネントを直接レンダリングする。
 * API コールは Playwright の page.route() でモックされる。
 */
import { createRoot } from "react-dom/client";
import { ManagedRuntime, Layer } from "effect";
import { App, RuntimeContext } from "../src/index";
import { ACCOUNTS } from "./fixtures";
import "../../../apps/web/src/app.css";

const runtime = ManagedRuntime.make(Layer.empty);

/**
 * ?empty=1 のとき initialAccounts を空にして、オンボーディング画面を表示する。
 */
const useEmptyAccounts = new URLSearchParams(window.location.search).has("empty");

function ScreenshotApp() {
  return (
    <RuntimeContext.Provider value={runtime}>
      <App initialAccounts={useEmptyAccounts ? [] : ACCOUNTS} />
    </RuntimeContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<ScreenshotApp />);
