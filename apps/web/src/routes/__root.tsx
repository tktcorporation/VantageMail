/**
 * ルートレイアウト。
 *
 * 背景: TanStack Start の __root.tsx は全ルートの共通レイアウト。
 * HTML の <head> やグローバルCSS、App シェルをここで定義する。
 * SSR 時にこの shellComponent がサーバー側でレンダリングされる。
 */
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VantageMail" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body className="font-[var(--font-sans)] text-sm text-[var(--color-text)] bg-[var(--color-bg)] antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
