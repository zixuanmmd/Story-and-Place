"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  createScopedQueryState,
  getRenderableEntries,
  scopedQueryReducer,
  type AuthDataScope,
  type ScopedQueryResult,
} from "@/lib/data/scoped-query";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";

type ScopedEntryQueryOptions<T extends { id: string }> = {
  scope: AuthDataScope;
  enabled: boolean;
  load: () => Promise<ScopedQueryResult<T>>;
  errorFallback: string;
};

export function useScopedEntryQuery<T extends { id: string }>({
  scope,
  enabled,
  load,
  errorFallback,
}: ScopedEntryQueryOptions<T>) {
  const [state, dispatch] = useReducer(
    scopedQueryReducer<T>,
    scope,
    createScopedQueryState<T>,
  );
  const requestSequence = useRef(0);
  const activeScope = useRef(scope);

  const reload = useCallback(async () => {
    if (!enabled) return;

    const requestId = ++requestSequence.current;
    const requestScope = scope;
    dispatch({ type: "request-started", scope: requestScope, requestId });

    try {
      const result = await load();
      if (activeScope.current !== requestScope) return;
      dispatch({
        type: "request-succeeded",
        scope: requestScope,
        requestId,
        result,
      });
    } catch (error) {
      reportOperationalError(error, "entry-query");
      if (activeScope.current !== requestScope) return;
      dispatch({
        type: "request-failed",
        scope: requestScope,
        requestId,
        error: getFriendlyError(error, errorFallback),
      });
    }
  }, [enabled, errorFallback, load, scope]);

  useEffect(() => {
    activeScope.current = scope;
    dispatch({ type: "scope-changed", scope });
    if (enabled) void reload();
  }, [enabled, reload, scope]);

  const upsert = useCallback(
    (entry: T) => dispatch({ type: "upsert", scope, entry }),
    [scope],
  );
  const remove = useCallback(
    (entryId: string) => dispatch({ type: "remove", scope, entryId }),
    [scope],
  );

  const scopeMatches = state.scope === scope;

  return {
    entries: getRenderableEntries(state, scope),
    truncated: scopeMatches ? state.truncated : false,
    loading: scopeMatches ? state.loading : enabled,
    error: scopeMatches ? state.error : null,
    reload,
    upsert,
    remove,
  };
}
