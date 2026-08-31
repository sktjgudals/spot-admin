"use client";

import { useCallback, useEffect, useRef } from "react";

type CursorAppendFocusOptions = {
  scopeKey: string;
  itemKeys: readonly string[];
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  hasNextPage: boolean;
  focusMode?: "append" | "page";
  viewKey?: string;
};

/**
 * Keeps cursor pagination keyboard-continuous. The trigger may disappear when
 * the terminal page arrives, so focus is handed to the first appended item.
 * A failed request moves focus to its retry action without discarding the
 * pending handoff; a successful retry then continues to the appended item.
 */
export function useCursorAppendFocus<T extends HTMLElement>({
  scopeKey,
  itemKeys,
  isFetchingNextPage,
  isFetchNextPageError,
  hasNextPage,
  focusMode = "append",
  viewKey = "",
}: CursorAppendFocusOptions) {
  const itemRefs = useRef(new Map<string, T>());
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLElement>(null);
  const pendingRef = useRef<{
    scopeKey: string;
    startIndex: number;
    itemKeys: string[];
    viewKey: string;
  } | null>(null);

  const setItemRef = useCallback((key: string, node: T | null) => {
    if (node) itemRefs.current.set(key, node);
    else itemRefs.current.delete(key);
  }, []);
  const setRetryButtonRef = useCallback((node: HTMLButtonElement | null) => {
    retryButtonRef.current = node;
  }, []);
  const setFallbackRef = useCallback((node: HTMLElement | null) => {
    fallbackRef.current = node;
  }, []);

  const beginAppend = useCallback(() => {
    pendingRef.current = {
      scopeKey,
      startIndex: itemKeys.length,
      itemKeys: [...itemKeys],
      viewKey,
    };
  }, [itemKeys, scopeKey, viewKey]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (pending.scopeKey !== scopeKey) {
      pendingRef.current = null;
      return;
    }

    if (isFetchNextPageError) {
      retryButtonRef.current?.focus();
      return;
    }
    if (isFetchingNextPage) return;

    if (focusMode === "page") {
      const pageChanged =
        pending.viewKey !== viewKey ||
        pending.itemKeys.length !== itemKeys.length ||
        pending.itemKeys.some((key, index) => key !== itemKeys[index]);
      if (pageChanged) {
        const currentPageItem = itemKeys[0]
          ? itemRefs.current.get(itemKeys[0])
          : undefined;
        (currentPageItem ?? fallbackRef.current)?.focus();
        pendingRef.current = null;
        return;
      }
    } else {
      const appendedKey = itemKeys[pending.startIndex];
      const appendedItem = appendedKey
        ? itemRefs.current.get(appendedKey)
        : undefined;
      if (appendedItem) {
        appendedItem.focus();
        pendingRef.current = null;
        return;
      }
    }

    if (!hasNextPage) {
      const retainedKey = itemKeys.at(-1);
      const retainedItem = retainedKey
        ? itemRefs.current.get(retainedKey)
        : undefined;
      (retainedItem ?? fallbackRef.current)?.focus();
      pendingRef.current = null;
    }
  }, [
    hasNextPage,
    focusMode,
    isFetchNextPageError,
    isFetchingNextPage,
    itemKeys,
    scopeKey,
    viewKey,
  ]);

  return { beginAppend, setFallbackRef, setItemRef, setRetryButtonRef };
}
