/**
 * D1 データベースバインディングの Effect Service。
 *
 * 背景: Cloudflare Workers では D1 バインディングがリクエスト時に提供される。
 * Effect の Context.Tag でラップし、Layer 経由で DI することで
 * テスト時のモック差し替えや、リクエストごとのバインディング注入を型安全に行う。
 *
 * 使用箇所: db.ts の全 DB 操作関数が D1Service に依存する
 */
import { Context, Layer } from "effect";

export class D1Service extends Context.Tag("D1Service")<D1Service, D1Database>() {
  /**
   * リクエストごとの D1 バインディングから Layer を構築する。
   * Cloudflare Workers の env.DB を渡して使う。
   */
  static layer = (db: D1Database) => Layer.succeed(D1Service, db);
}
