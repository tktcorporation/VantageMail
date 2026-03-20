/**
 * インスタント検索バー。
 *
 * 背景: Gmail検索演算子（from:, to:, subject:, has:attachment, label:,
 * after:, before:）をフルサポートし、Gmail APIに直接パススルーする。
 * クロスアカウント検索では全接続アカウントを同時に検索（spec §5.4）。
 *
 * キーストロークから100ms以内にサジェスト表示（spec §5.4 受入基準）。
 * デバウンス300msでAPI呼び出しを間引く。
 */
import { useState, useCallback, useRef, useEffect } from "react";

const OPERATOR_SUGGESTIONS = [
  { operator: "from:", description: "送信者で検索", example: "from:alice@example.com" },
  { operator: "to:", description: "宛先で検索", example: "to:bob@example.com" },
  { operator: "subject:", description: "件名で検索", example: "subject:会議" },
  { operator: "has:attachment", description: "添付ファイル付き", example: "has:attachment" },
  { operator: "label:", description: "ラベルで検索", example: "label:important" },
  { operator: "is:unread", description: "未読メールのみ", example: "is:unread" },
  { operator: "is:starred", description: "スター付きのみ", example: "is:starred" },
  { operator: "after:", description: "指定日以降", example: "after:2026/01/01" },
  { operator: "before:", description: "指定日以前", example: "before:2026/03/01" },
  { operator: "newer_than:", description: "指定期間内", example: "newer_than:7d" },
  { operator: "filename:", description: "添付ファイル名", example: "filename:report.pdf" },
];

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
}

export function SearchBar({ onSearch, onClear }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filteredSuggestions = query
    ? OPERATOR_SUGGESTIONS.filter(
        (s) =>
          s.operator.toLowerCase().includes(query.toLowerCase()) ||
          s.description.includes(query),
      )
    : OPERATOR_SUGGESTIONS;

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      setShowSuggestions(value.length === 0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) { onClear(); return; }
      debounceRef.current = setTimeout(() => onSearch(value), 300);
    },
    [onSearch, onClear],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && query.trim()) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        onSearch(query);
        setShowSuggestions(false);
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        inputRef.current?.blur();
      }
    },
    [query, onSearch],
  );

  const insertOperator = useCallback((operator: string) => {
    setQuery((prev) => prev ? `${prev} ${operator}` : operator);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div className="relative">
      {/* 検索入力 */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
        isFocused
          ? "bg-[var(--color-bg)] border border-[var(--color-accent)]"
          : "bg-[var(--color-bg-secondary)] border border-[var(--color-border-light)]"
      }`}>
        <span className="text-[var(--color-text-tertiary)] text-[13px]">/</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { setIsFocused(true); setShowSuggestions(true); }}
          onBlur={() => { setIsFocused(false); setTimeout(() => setShowSuggestions(false), 200); }}
          onKeyDown={handleKeyDown}
          placeholder="メールを検索... (Gmail演算子対応)"
          className="flex-1 border-none outline-none text-[13px] bg-transparent text-[var(--color-text)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onClear(); }}
            className="bg-none border-none text-[var(--color-text-tertiary)] cursor-pointer text-[11px] px-1 hover:text-[var(--color-text)]"
          >
            ×
          </button>
        )}
      </div>

      {/* サジェストドロップダウン */}
      {showSuggestions && isFocused && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md shadow-lg max-h-70 overflow-auto z-50">
          <div className="px-3 py-1 text-[11px] text-[var(--color-text-tertiary)] border-b border-[var(--color-border-light)]">
            Gmail 検索演算子
          </div>
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion.operator}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertOperator(suggestion.operator)}
              className="flex items-center justify-between w-full px-3 py-2 bg-transparent border-none cursor-pointer text-[13px] text-left text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]"
            >
              <span>
                <code className="text-[11px] bg-[var(--color-bg-tertiary)] px-1 py-px rounded font-mono mr-2">
                  {suggestion.operator}
                </code>
                {suggestion.description}
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                {suggestion.example}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
