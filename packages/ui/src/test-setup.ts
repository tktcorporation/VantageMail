/**
 * Vitest テストセットアップ。
 *
 * 背景: vitest が pnpm catalog で npm:@voidzero-dev/vite-plus-test にエイリアスされているため、
 * @testing-library/jest-dom/vitest の declare module 'vitest' による自動拡張が効かない。
 * 代わりに matchers を手動で expect.extend() に渡す。
 */
import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
