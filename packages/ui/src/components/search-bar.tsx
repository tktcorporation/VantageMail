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

/** Gmail検索演算子のサジェスト候補 */
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
  /** 検索実行時のコールバック（各アカウントに対して呼ばれる） */
  onSearch: (query: string) => void;
  /** 検索クリア時のコールバック */
  onClear: () => void;
}

export function SearchBar({ onSearch, onClear }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  /** 入力のマッチに基づいてサジェストをフィルタリング */
  const filteredSuggestions = query
    ? OPERATOR_SUGGESTIONS.filter(
        (s) =>
          s.operator.toLowerCase().includes(query.toLowerCase()) ||
          s.description.includes(query),
      )
    : OPERATOR_SUGGESTIONS;

  /** デバウンス付き検索実行 */
  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      setShowSuggestions(value.length === 0);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        onClear();
        return;
      }

      // 300msデバウンスでAPI呼び出し
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    },
    [onSearch, onClear],
  );

  /** Enter で即座に検索実行 */
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

  /** サジェストクリックで演算子を挿入 */
  const insertOperator = useCallback((operator: string) => {
    setQuery((prev) => {
      const newQuery = prev ? `${prev} ${operator}` : operator;
      return newQuery;
    });
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, []);

  // / キーで検索バーにフォーカス
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* 検索入力 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-sm)",
          padding: "var(--space-sm) var(--space-md)",
          background: isFocused ? "var(--color-bg)" : "var(--color-bg-secondary)",
          border: `1px solid ${isFocused ? "var(--color-accent)" : "var(--color-border-light)"}`,
          borderRadius: "var(--radius-md)",
          transition: "all var(--transition-fast)",
        }}
      >
        <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
          /
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { setIsFocused(true); setShowSuggestions(true); }}
          onBlur={() => { setIsFocused(false); setTimeout(() => setShowSuggestions(false), 200); }}
          onKeyDown={handleKeyDown}
          placeholder="メールを検索... (Gmail演算子対応)"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: "var(--text-sm)",
            background: "transparent",
            color: "var(--color-text)",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onClear(); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-tertiary)",
              cursor: "pointer",
              fontSize: "var(--text-xs)",
              padding: "2px 4px",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* サジェストドロップダウン */}
      {showSuggestions && isFocused && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            maxHeight: 280,
            overflow: "auto",
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: "var(--space-xs) var(--space-md)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            Gmail 検索演算子
          </div>
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion.operator}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertOperator(suggestion.operator)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "var(--space-sm) var(--space-md)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "var(--text-sm)",
                textAlign: "left",
                color: "var(--color-text)",
              }}
            >
              <span>
                <code
                  style={{
                    fontSize: "var(--text-xs)",
                    background: "var(--color-bg-tertiary)",
                    padding: "1px 4px",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-mono)",
                    marginRight: "var(--space-sm)",
                  }}
                >
                  {suggestion.operator}
                </code>
                {suggestion.description}
              </span>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {suggestion.example}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
