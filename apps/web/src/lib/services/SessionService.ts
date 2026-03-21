/**
 * セッション操作の Effect Service。
 *
 * 背景: TanStack Start のセッション（暗号化 Cookie）を Effect で型安全に操作する。
 * セッションの読み書きで発生するエラーを SessionError / NotAuthenticated として
 * 型レベルで追跡し、呼び出し側でハンドリング漏れを防ぐ。
 *
 * 使用箇所: OAuth コールバック、API ルート、認証ガード
 */
import { Context, Effect, Layer } from "effect"
import type { SessionError, NotAuthenticated } from "@vantagemail/core"
import type { AppSessionData } from "../session.ts"

export interface SessionServiceImpl {
  /** 現在のセッションデータを読み出す */
  get: () => Effect.Effect<AppSessionData, SessionError>
  /** セッションデータを更新する（前の値を受け取って新しい値を返す関数を渡す） */
  update: (fn: (prev: AppSessionData) => AppSessionData) => Effect.Effect<void, SessionError>
  /** セッションをクリアする（ログアウト時） */
  clear: () => Effect.Effect<void, SessionError>
  /** 認証済みであることを要求し、userId と dek を返す。未認証なら NotAuthenticated */
  requireAuth: () => Effect.Effect<{ userId: string; dek: string }, NotAuthenticated>
}

export class SessionService extends Context.Tag("SessionService")<
  SessionService,
  SessionServiceImpl
>() {
  /**
   * Layer の構築にはセッション設定（cookie password 等）とリクエストコンテキストが必要。
   * TanStack Start のセッション API に依存するため、実装は API ルート層で提供する。
   *
   * 背景: SessionService.live は Task 5（OAuth + API ルート Effect 化）で
   * useServerSession() を使って実装される予定。ここではインターフェースのみ定義する。
   */
  static layer = (impl: SessionServiceImpl) =>
    Layer.succeed(SessionService, impl)
}
