// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchBar } from "../search-bar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SearchBar", () => {
  it("operator suggestion updates the query and dispatches a search", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} onClear={vi.fn()} />);
    const input = screen.getByPlaceholderText("メールを検索...");
    fireEvent.focus(input);
    fireEvent.click(screen.getByText("送信者で検索"));
    expect((input as HTMLInputElement).value).toBe("from:");
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledWith("from:");
  });

  it("clearing cancels an unsent search, including after repeated edits", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    render(<SearchBar onSearch={onSearch} onClear={onClear} />);
    const input = screen.getByPlaceholderText("メールを検索...");
    fireEvent.change(input, { target: { value: "old" } });
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.click(screen.getByLabelText("検索をクリア"));
    vi.advanceTimersByTime(500);
    expect(onSearch).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
