# スクリーンショット自動生成

## 目的

各ページ状態のスクリーンショットを自動生成し、UI改善作業時に全体感を把握できるようにする。
`pnpm screenshot` で手動実行。

## 撮影する状態（5枚）

| #   | 状態                                                   | ファイル名               |
| --- | ------------------------------------------------------ | ------------------------ |
| 1   | 初期状態（カテゴリ=all、カードビュー、スレッド未選択） | `01-initial.png`         |
| 2   | スレッド選択中（メール本文表示）                       | `02-thread-selected.png` |
| 3   | カテゴリフィルタ（「重要」、フラットビュー）           | `03-category-filter.png` |
| 4   | 設定画面                                               | `04-settings.png`        |
| 5   | コマンドパレット                                       | `05-command-palette.png` |

## 技術構成

- **Playwright** — ブラウザ操作 + スクリーンショット撮影
- **page.route()** — API モック（MSW 不要、Playwright 組み込み機能）
- **フィクスチャ** — モックデータを共通ファイルに切り出し（将来テストでも再利用可能）

## ファイル構成

```
packages/ui/
├── screenshots/              ← 生成物(.gitignore)
├── e2e/
│   ├── fixtures.ts           ← モックデータ
│   └── screenshots.spec.ts   ← 撮影スクリプト
└── playwright.config.ts
```

## モックする API

| エンドポイント                     | レスポンス                     |
| ---------------------------------- | ------------------------------ |
| `GET /api/threads?accountId=*`     | スレッド一覧（フィクスチャ）   |
| `GET /api/threads/:id?accountId=*` | メッセージ一覧（フィクスチャ） |
| TanStack Start ローダー RPC        | アカウント一覧（フィクスチャ） |

## 実行方法

```bash
pnpm screenshot    # packages/ui の Playwright を実行 → screenshots/ に保存
```
