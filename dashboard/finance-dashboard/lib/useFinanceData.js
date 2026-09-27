"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fetches /api/data once on mount. Shared by the Overview and Transactions
 * tabs so the fetch/loading/error/reload logic lives in one place. The route
 * sets a 60s private cache, so navigating between tabs re-uses it cheaply.
 */
export function useFinanceData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/data");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Request failed");
      }
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
