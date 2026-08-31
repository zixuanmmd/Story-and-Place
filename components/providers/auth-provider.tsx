"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getFriendlyError } from "@/lib/errors";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { recordAuthenticatedSession } from "@/lib/analytics/provider";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  dataReady: boolean;
  dataScope: string;
  configured: boolean;
  authError: string | null;
  isAdmin: boolean;
  refreshAuth: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileState, setProfileState] = useState<{
    userId: string | null;
    profile: Profile | null;
  }>({ userId: null, profile: null });
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminState, setAdminState] = useState<{ userId: string | null; isAdmin: boolean }>({
    userId: null,
    isAdmin: false,
  });
  const activeUserId = useRef<string | null>(null);
  const profileRequestSequence = useRef(0);
  const adminRequestSequence = useRef(0);

  const syncAdminSession = useCallback(async (nextSession: Session | null) => {
    const requestId = ++adminRequestSequence.current;
    const userId = nextSession?.user.id ?? null;
    if (!nextSession) {
      setAdminState({ userId: null, isAdmin: false });
      try {
        await fetch("/api/admin/session", { method: "DELETE" });
      } catch {
        // The HttpOnly cookie also expires quickly; sign-out state is hidden immediately.
      }
      return;
    }
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const payload: unknown = await response.json();
      const isAdmin = typeof payload === "object"
        && payload !== null
        && "isAdmin" in payload
        && payload.isAdmin === true;
      if (adminRequestSequence.current === requestId && activeUserId.current === userId) {
        setAdminState({ userId, isAdmin });
      }
    } catch {
      if (adminRequestSequence.current === requestId && activeUserId.current === userId) {
        setAdminState({ userId, isAdmin: false });
      }
    }
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequestSequence.current;
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (
        activeUserId.current !== userId ||
        profileRequestSequence.current !== requestId
      ) {
        return;
      }
      setProfileState({ userId, profile: data });
    } catch (error) {
      if (activeUserId.current !== userId) return;
      setAuthError(getFriendlyError(error, "无法读取个人资料。"));
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) {
      await loadProfile(session.user.id);
    }
  }, [loadProfile, session]);

  const refreshAuth = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const nextUserId = data.session?.user.id ?? null;
      activeUserId.current = nextUserId;
      profileRequestSequence.current += 1;
      setProfileState({ userId: nextUserId, profile: null });
      setSession(data.session);
      setAuthError(null);
      setLoading(false);
      void syncAdminSession(data.session);

      if (nextUserId) {
        recordAuthenticatedSession(nextUserId);
        await loadProfile(nextUserId);
      }
    } catch (error) {
      setAuthError(getFriendlyError(error));
      setLoading(false);
    }
  }, [loadProfile, syncAdminSession]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabaseBrowserClient();
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(getFriendlyError(error));
      activeUserId.current = data.session?.user.id ?? null;
      profileRequestSequence.current += 1;
      setProfileState({ userId: activeUserId.current, profile: null });
      setSession(data.session);
      void syncAdminSession(data.session);
      if (data.session?.user.id) {
        recordAuthenticatedSession(data.session.user.id);
        void loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      activeUserId.current = nextSession?.user.id ?? null;
      profileRequestSequence.current += 1;
      setProfileState({ userId: activeUserId.current, profile: null });
      setSession(nextSession);
      void syncAdminSession(nextSession);
      setAuthError(null);
      if (nextSession?.user.id) {
        recordAuthenticatedSession(nextSession.user.id);
        window.setTimeout(() => void loadProfile(nextSession.user.id), 0);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile, syncAdminSession]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    setAuthError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      activeUserId.current = null;
      profileRequestSequence.current += 1;
      setSession(null);
      adminRequestSequence.current += 1;
      setAdminState({ userId: null, isAdmin: false });
      void fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
      setProfileState({ userId: null, profile: null });
      for (const key of [
        "story-map-pending-entry",
        "story-map-onboarding-draft",
        "story-route-selection-v1",
      ]) {
        window.sessionStorage.removeItem(key);
      }
    } catch (error) {
      setAuthError(getFriendlyError(error, "退出登录失败，请重试。"));
      throw error;
    } finally {
      setSigningOut(false);
    }
  }, []);

  const currentUserId = signingOut ? null : session?.user.id ?? null;
  const dataReady = !loading && !signingOut;
  const dataScope = signingOut
    ? "auth-transition"
    : currentUserId ?? "anon";
  const profile =
    profileState.userId === currentUserId ? profileState.profile : null;
  const isAdmin = adminState.userId === currentUserId && adminState.isAdmin;

  const value = useMemo<AuthContextValue>(
    () => ({
      user: signingOut ? null : session?.user ?? null,
      session: signingOut ? null : session,
      profile,
      loading: loading || signingOut,
      dataReady,
      dataScope,
      configured: isSupabaseConfigured,
      authError,
      isAdmin,
      refreshAuth,
      refreshProfile,
      signOut,
    }),
    [
      authError,
      isAdmin,
      dataReady,
      dataScope,
      loading,
      profile,
      refreshAuth,
      refreshProfile,
      session,
      signingOut,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 中使用。");
  }
  return context;
}
