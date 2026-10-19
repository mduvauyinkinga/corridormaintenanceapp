/**
 * context/AuthContext.js
 * ------------------------------------------------------------------
 * The mobile equivalent of the website's route guards
 * (js/auth.js: requireAuth / requireRole / logout).
 *
 * Responsibilities:
 *   - resolve the persisted session against the backend (subscribeToAuthState),
 *   - load the signed-in user's profile,
 *   - expose { status, user, profile }, so the navigator can apply the
 *     EXACT website routing rules:
 *        no account              → login
 *        no profile document     → choose room
 *        resident without roomId → choose room
 *        management              → management area
 *        resident with roomId    → resident area
 *   - refresh the profile after the room-claim transaction,
 *   - sign out.
 *
 * Web equivalent: js/auth.js + the redirect logic in js/login.js.
 * Note: the role is never trusted from the client — the backend derives the
 * user from the JWT and re-checks the role on every management request.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getUserProfile,
  registerResident,
  signIn as signInService,
  signOutUser,
  subscribeToAuthState,
} from "../services/authService";
import { isOfflineError, getErrorMessage } from "../utils/errors";

const AuthContext = createContext(null);

/** Auth lifecycle states used by the navigator. */
export const AUTH_STATUS = {
  LOADING: "loading",
  SIGNED_OUT: "signedOut",
  SIGNED_IN: "signedIn",
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.LOADING);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  /** Load (or reload) the Firestore profile for the current user. */
  const refreshProfile = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null);
      return null;
    }
    try {
      const fresh = await getUserProfile(uid);
      setProfile(fresh);
      setProfileError(null);
      return fresh;
    } catch (error) {
      console.error("[AuthContext] profile load failed:", error);
      // A resident stays usable with the cached profile if the network drops.
      setProfileError(getErrorMessage(error));
      throw error;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setProfile(null);
        setProfileError(null);
        setStatus(AUTH_STATUS.SIGNED_OUT);
        return;
      }

      setStatus(AUTH_STATUS.SIGNED_IN);
      try {
        await refreshProfile(currentUser.uid);
      } catch (error) {
        // Keep the app usable: the user is authenticated, the profile can be
        // retried from any screen (see ProfileScreen "Retry").
        if (!isOfflineError(error)) setProfile(null);
      }
    });

    return unsubscribe;
  }, [refreshProfile]);

  /** Sign in (js/login.js step 1 + 2). */
  const signIn = useCallback(async (email, password) => {
    const result = await signInService(email, password);
    setUser(result.user);
    setProfile(result.profile);
    setStatus(AUTH_STATUS.SIGNED_IN);
    return result;
  }, []);

  /** Create a resident account (js/register.js). */
  const register = useCallback(
    async (form) => {
      const uid = await registerResident(form);
      const fresh = await refreshProfile(uid);
      return fresh;
    },
    [refreshProfile]
  );

  /** Sign out (js/auth.js logout). */
  const signOut = useCallback(async () => {
    await signOutUser();
    setProfile(null);
    setProfileError(null);
    setUser(null);
    setStatus(AUTH_STATUS.SIGNED_OUT);
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      uid: user?.uid || null,
      profile,
      profileError,
      isManagement: profile?.role === "management",
      isResident: profile?.role === "resident",
      hasRoom: Boolean(profile?.roomId),
      refreshProfile,
      signIn,
      register,
      signOut,
    }),
    [status, user, profile, profileError, refreshProfile, signIn, register, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the session context. Throws when used outside the provider. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
