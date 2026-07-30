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

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  dataReady: boolean;
  dataScope: string;
  configured: boolean;
  authError: string | null;
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
  const activeUserId = useRef<string | null>(null);
  const profileRequestSequence = useRef(0);

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

      if (nextUserId) {
        await loadProfile(nextUserId);
      }
    } catch (error) {
      setAuthError(getFriendlyError(error));
      setLoading(false);
    }
  }, [loadProfile]);

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
      if (data.session?.user.id) {
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
      setAuthError(null);
      if (nextSession?.user.id) {
        window.setTimeout(() => void loadProfile(nextSession.user.id), 0);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

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
      setProfileState({ userId: null, profile: null });
      for (const key of [
        "story-map-pending-entry",
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
      refreshAuth,
      refreshProfile,
      signOut,
    }),
    [
      authError,
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
