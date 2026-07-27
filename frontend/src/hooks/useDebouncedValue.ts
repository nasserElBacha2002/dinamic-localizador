import { useCallback, useEffect, useRef, useState } from "react";

export interface DebouncedValueController<T> {
  value: T;
  /** Cancel any pending timer; subsequent emissions from that generation are ignored. */
  cancel: () => void;
}

/**
 * Debounced value with an explicit cancel contract.
 * Prefer this when a reset/clear must discard in-flight debounce work.
 */
export function useDebouncedValueController<T>(
  value: T,
  delayMs = 300,
): DebouncedValueController<T> {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const generation = generationRef.current;
    timeoutRef.current = setTimeout(() => {
      if (generation !== generationRef.current) {
        return;
      }
      setDebouncedValue(value);
      timeoutRef.current = null;
    }, delayMs);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [delayMs, value]);

  return { value: debouncedValue, cancel };
}

/** Convenience wrapper that returns only the debounced value. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  return useDebouncedValueController(value, delayMs).value;
}
