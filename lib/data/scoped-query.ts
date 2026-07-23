export const ANONYMOUS_SCOPE = "anon" as const;

export type AuthDataScope = typeof ANONYMOUS_SCOPE | string;

export type ScopedQueryResult<T> = {
  entries: T[];
  truncated: boolean;
};

export type ScopedQueryState<T> = ScopedQueryResult<T> & {
  scope: AuthDataScope;
  requestId: number;
  loading: boolean;
  error: string | null;
};

export type ScopedQueryAction<T extends { id: string }> =
  | { type: "scope-changed"; scope: AuthDataScope }
  | { type: "request-started"; scope: AuthDataScope; requestId: number }
  | {
      type: "request-succeeded";
      scope: AuthDataScope;
      requestId: number;
      result: ScopedQueryResult<T>;
    }
  | {
      type: "request-failed";
      scope: AuthDataScope;
      requestId: number;
      error: string;
    }
  | { type: "upsert"; scope: AuthDataScope; entry: T }
  | { type: "remove"; scope: AuthDataScope; entryId: string };

export function getAuthDataScope(userId: string | null | undefined): AuthDataScope {
  return userId ?? ANONYMOUS_SCOPE;
}

export function createScopedQueryState<T>(scope: AuthDataScope): ScopedQueryState<T> {
  return {
    scope,
    requestId: 0,
    entries: [],
    truncated: false,
    loading: false,
    error: null,
  };
}

export function scopedQueryReducer<T extends { id: string }>(
  state: ScopedQueryState<T>,
  action: ScopedQueryAction<T>,
): ScopedQueryState<T> {
  if (action.type === "scope-changed") {
    if (action.scope === state.scope) return state;
    return createScopedQueryState(action.scope);
  }

  if (action.scope !== state.scope) return state;

  switch (action.type) {
    case "request-started":
      return {
        ...state,
        requestId: action.requestId,
        loading: true,
        error: null,
      };
    case "request-succeeded":
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        ...action.result,
        loading: false,
        error: null,
      };
    case "request-failed":
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        loading: false,
        error: action.error,
      };
    case "upsert": {
      const exists = state.entries.some((entry) => entry.id === action.entry.id);
      return {
        ...state,
        entries: exists
          ? state.entries.map((entry) =>
              entry.id === action.entry.id ? action.entry : entry,
            )
          : [action.entry, ...state.entries],
      };
    }
    case "remove":
      return {
        ...state,
        entries: state.entries.filter((entry) => entry.id !== action.entryId),
      };
  }
}

export function getRenderableEntries<T>(
  state: ScopedQueryState<T>,
  currentScope: AuthDataScope,
): T[] {
  return state.scope === currentScope ? state.entries : [];
}

export function getRenderableSelectedEntry<
  T extends { user_id: string; visibility: "public" | "private" | "group" },
>(entry: T | null, currentUserId: string | null): T | null {
  if (!entry) return null;
  if (entry.visibility === "public") return entry;
  if (entry.visibility === "group") return currentUserId ? entry : null;
  return entry.user_id === currentUserId ? entry : null;
}
