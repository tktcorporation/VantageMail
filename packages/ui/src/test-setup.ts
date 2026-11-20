/**
 * Vitest テストセットアップ。
 *
 * jest-dom の matcher（toBeInTheDocument など）を expect に登録し、
 * vitest の Assertion 型へ同じ matcher を足す。vite-plus/test は vitest を
 * そのまま再エクスポートしているため、jest-dom の vitest 用エントリで両方が揃う。
 */
import "@testing-library/jest-dom/vitest";
