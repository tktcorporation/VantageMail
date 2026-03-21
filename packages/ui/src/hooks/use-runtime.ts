/**
 * Effect ManagedRuntime の React Context。
 *
 * 背景: Effect-TS のサービスレイヤーを React ツリーに注入するための Context。
 * 現時点では Layer.empty で十分だが、将来的に HttpClient や Logger 等の
 * サービスを追加する際に、ここから ManagedRuntime を取得できる。
 *
 * 使用箇所: app-shell.tsx で Provider を設置、各 hook で useRuntime() で取得。
 * Layer.empty 以外が不要になれば削除可能。
 */
import { createContext, useContext } from "react"
import type { ManagedRuntime } from "effect"

/**
 * ManagedRuntime を React ツリーに注入する Context。
 * app-shell.tsx 等で RuntimeContext.Provider を設置する。
 */
export const RuntimeContext = createContext<ManagedRuntime.ManagedRuntime<never, never> | null>(null)

/**
 * RuntimeContext から ManagedRuntime を取得するフック。
 * Provider が見つからない場合はエラーをスローする。
 */
export const useRuntime = () => {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error("RuntimeContext.Provider が見つかりません")
  return runtime
}
