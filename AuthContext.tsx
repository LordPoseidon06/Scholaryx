import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString } from '../lib/utils';
import type { StudentProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  profile: StudentProfile | null;
  loading: boolean;
  authError: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfileData: (updates: Partial<Omit<StudentProfile, 'uid' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('scholaris_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('scholaris_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);
      setAuthError(null);

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          const userPayload: Record<string, unknown> = {
            uid: firebaseUser.uid,
            email: clampString(firebaseUser.email || 'student@university.edu', 200),
            displayName: clampString(firebaseUser.displayName || 'University Student', 120),
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
            displayName: clampString(firebaseUser.displayName || 'University Student', 120),
            university: 'State University',
            program: 'Undergraduate Studies',
            yearOfStudy: 'Year 1',
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

        unsubProfile = onSnapshot(
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
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = async () => {
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
        signInWithGoogle,
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
