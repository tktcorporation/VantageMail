/**
 * @vantagemail/ui — 共有Reactコンポーネント
 *
 * デスクトップ/Web両方で使用されるUIコンポーネント、hooks、レイアウトを提供。
 * プラットフォーム固有のAPI呼び出しは含まない（それらはapps/側のアダプターで処理）。
 */

export { App } from "./app";
export { AppLayout } from "./layouts/app-layout";
export { Sidebar } from "./components/sidebar";
export { ThreadList } from "./components/thread-list";
export { ThreadView } from "./components/thread-view";
export { CommandPalette } from "./components/command-palette";
export { Composer } from "./components/composer";
export { SearchBar } from "./components/search-bar";
export { Onboarding } from "./components/onboarding";
export { RuntimeContext, useRuntime } from "./hooks/use-runtime";
