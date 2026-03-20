/**
 * メインルート（/）— VantageMail のメール UI。
 *
 * 背景: TanStack Start のファイルベースルーティングにより、
 * このファイルが / パスに自動マッピングされる。
 * packages/ui の App コンポーネントをレンダリングする。
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "~/components/app-shell";

export const Route = createFileRoute("/")({
  component: AppShell,
});
