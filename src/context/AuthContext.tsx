import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString } from '../lib/utils';
import type { StudentProfile } from '../types';

export interface SignUpWithEmailPayload {
  displayName: string;
  email: string;
  password: string;
  university?: string;
  program?: string;
  yearOfStudy?: string;
}

interface PendingProfileDetails {
  displayName?: string;
  university?: string;
  program?: string;
  yearOfStudy?: string;
}

interface AuthContextValue {
  user: User | null;
  profile: StudentProfile | null;
  loading: boolean;
  authError: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (payload: SignUpWithEmailPayload) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: (silent?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfileData: (updates: Partial<Omit<StudentProfile, 'uid' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PENDING_PROFILE_PREFIX = 'scholaryx_pending_profile_';

function formatAuthError(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in or resetting your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials or reset your password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support for assistance.';
    case 'auth/too-many-requests':
      return 'Too many attempts detected. Please wait a moment before trying again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled yet in Firebase Authentication. Enable the Email/Password provider in Firebase Console (Authentication -> Sign-in method).';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists for this email with a different sign-in method. Sign in with your original method.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to authentication servers. Check your internet connection.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed.';
  }
}

function readPendingProfile(uid: string): PendingProfileDetails | null {
  try {
    const raw = localStorage.getItem(`${PENDING_PROFILE_PREFIX}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as PendingProfileDetails;
  } catch {
    return null;
  }
}

function writePendingProfile(uid: string, details: PendingProfileDetails): void {
  try {
    localStorage.setItem(`${PENDING_PROFILE_PREFIX}${uid}`, JSON.stringify(details));
  } catch {
    // Ignore storage quota errors
  }
}

function clearPendingProfile(uid: string): void {
  try {
    localStorage.removeItem(`${PENDING_PROFILE_PREFIX}${uid}`);
  } catch {
    // Ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('scholaris_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const unsubProfileRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('scholaris_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const provisionAndSubscribe = useCallback(async (firebaseUser: User) => {
    if (unsubProfileRef.current) {
      unsubProfileRef.current();
      unsubProfileRef.current = undefined;
    }

    setUser(firebaseUser);
    setAuthError(null);

    // Firestore rules mandate email_verified == true before creating or updating records.
    if (!firebaseUser.emailVerified) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const pending = readPendingProfile(firebaseUser.uid);
      const emailPrefixName = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'University Student';
      const resolvedName = clampString(
        pending?.displayName || firebaseUser.displayName || emailPrefixName || 'University Student',
        120
      );

      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const userPayload: Record<string, unknown> = {
          uid: firebaseUser.uid,
          email: clampString(firebaseUser.email || 'student@university.edu', 200),
          displayName: resolvedName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (firebaseUser.photoURL) {
          userPayload.photoURL = clampString(firebaseUser.photoURL, 500);
        }
        await setDoc(userRef, userPayload);
      }

      const profileRef = doc(db, 'profiles', firebaseUser.uid);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        const profilePayload: Record<string, unknown> = {
          uid: firebaseUser.uid,
          displayName: resolvedName,
          university: clampString(pending?.university || 'State University', 150) || 'State University',
          program: clampString(pending?.program || 'Undergraduate Studies', 150) || 'Undergraduate Studies',
          yearOfStudy: clampString(pending?.yearOfStudy || 'Year 1', 40) || 'Year 1',
          bio: '',
          courses: [],
          studyInterests: [],
          isPublic: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (firebaseUser.photoURL) {
          profilePayload.photoURL = clampString(firebaseUser.photoURL, 500);
        }
        await setDoc(profileRef, profilePayload);
      }

      clearPendingProfile(firebaseUser.uid);

      unsubProfileRef.current = onSnapshot(
        profileRef,
        (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as StudentProfile);
          }
          setLoading(false);
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, `profiles/${firebaseUser.uid}`);
        }
      );
    } catch (err) {
      console.error('Auth provisioning error:', err);
      setAuthError(err instanceof Error ? err.message : 'Unable to initialize student account.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfileRef.current) {
        unsubProfileRef.current();
        unsubProfileRef.current = undefined;
      }

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      await provisionAndSubscribe(firebaseUser);
    });

    return () => {
      unsubAuth();
      if (unsubProfileRef.current) unsubProfileRef.current();
    };
  }, [provisionAndSubscribe]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signUpWithEmail = async (payload: SignUpWithEmailPayload) => {
    setAuthError(null);
    const cleanEmail = payload.email.trim();
    const cleanName = clampString(payload.displayName || cleanEmail.split('@')[0] || 'Student', 120);

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, payload.password);
      writePendingProfile(cred.user.uid, {
        displayName: cleanName,
        university: payload.university ? clampString(payload.university, 150) : undefined,
        program: payload.program ? clampString(payload.program, 150) : undefined,
        yearOfStudy: payload.yearOfStudy ? clampString(payload.yearOfStudy, 40) : undefined,
      });

      await updateProfile(cred.user, { displayName: cleanName });
      await sendEmailVerification(cred.user);
      setUser(cred.user);
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const resendVerificationEmail = async () => {
    setAuthError(null);
    if (!auth.currentUser) {
      throw new Error('No active user session found.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const refreshVerificationStatus = async (silent = false): Promise<boolean> => {
    if (!silent) setAuthError(null);
    const current = auth.currentUser;
    if (!current) return false;
    try {
      await current.reload();
      await current.getIdToken(true);
      const refreshedUser = auth.currentUser;
      if (refreshedUser?.emailVerified) {
        await provisionAndSubscribe(refreshedUser);
        return true;
      }
      if (!silent) {
        setAuthError('Your email is not verified yet. Open the verification link sent to your inbox, then click Continue.');
      }
      return false;
    } catch (err) {
      if (!silent) {
        const msg = formatAuthError(err);
        setAuthError(msg);
      }
      return false;
    }
  };

  const logout = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  const updateProfileData = async (
    updates: Partial<Omit<StudentProfile, 'uid' | 'createdAt' | 'updatedAt'>>
  ) => {
    if (!user) throw new Error('You must be signed in.');
    const path = `profiles/${user.uid}`;
    try {
      const sanitized: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (updates.displayName !== undefined) sanitized.displayName = clampString(updates.displayName || 'Student', 120);
      if (updates.university !== undefined) sanitized.university = clampString(updates.university, 150);
      if (updates.program !== undefined) sanitized.program = clampString(updates.program, 150);
      if (updates.yearOfStudy !== undefined) sanitized.yearOfStudy = clampString(updates.yearOfStudy, 40);
      if (updates.bio !== undefined) sanitized.bio = clampString(updates.bio, 600);
      if (updates.courses !== undefined) {
        sanitized.courses = updates.courses
          .map((c) => clampString(c.toUpperCase(), 24))
          .filter(Boolean)
          .slice(0, 15);
      }
      if (updates.studyInterests !== undefined) {
        sanitized.studyInterests = updates.studyInterests
          .map((s) => clampString(s, 60))
          .filter(Boolean)
          .slice(0, 10);
      }
      if (updates.isPublic !== undefined) sanitized.isPublic = Boolean(updates.isPublic);
      if (updates.photoURL !== undefined) sanitized.photoURL = clampString(updates.photoURL, 500);

      await updateDoc(doc(db, 'profiles', user.uid), sanitized);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authError,
        theme,
        toggleTheme,
        clearAuthError,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        refreshVerificationStatus,
        logout,
        updateProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
