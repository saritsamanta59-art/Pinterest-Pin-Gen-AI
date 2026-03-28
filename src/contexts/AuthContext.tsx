import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

export interface PinterestAccount {
  id: string;
  name: string;
  token: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  theme?: 'light' | 'dark' | 'system';
  geminiApiKey?: string;
  pinterestAccounts?: PinterestAccount[];
  plan?: 'free' | 'pro';
  role?: 'user' | 'admin';
  maxPinterestAccounts?: number;
  maxPinsPerMonth?: number;
  pinsCreatedThisMonth?: number;
  totalPinsCreated?: number;
  totalPinsPublished?: number;
  totalPinsScheduled?: number;
  lastPinCreatedAt?: any;
  createdAt: any;
  updatedAt: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  signupWithEmail: (email: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithPinterest: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  if (authError) {
    throw authError;
  }

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setProfile(data);
            setIsAdmin(data.role === 'admin' || currentUser.email === 'mautrishakarar99@gmail.com');
          } else {
            const newProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              bio: '',
              theme: 'system',
              plan: 'free',
              role: currentUser.email === 'mautrishakarar99@gmail.com' ? 'admin' : 'user',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            try {
              await setDoc(docRef, newProfile);
              setProfile(newProfile as UserProfile);
              setIsAdmin(newProfile.role === 'admin');
            } catch (error: any) {
              const errStr = error?.message || String(error);
              if (errStr.includes('Quota') || errStr.includes('quota')) {
                console.warn("Firestore Quota Exceeded on write. Using local fallback profile.");
                setProfile(newProfile as UserProfile);
                setIsAdmin(newProfile.role === 'admin');
              } else {
                try {
                  handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
                } catch (e) {
                  setAuthError(e as Error);
                }
              }
            }
          }
        } catch (error: any) {
          const errStr = error?.message || String(error);
          if (errStr.includes('Quota') || errStr.includes('quota')) {
            console.warn("Firestore Quota Exceeded. Using local fallback profile.");
            setProfile({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Demo User',
              photoURL: currentUser.photoURL || '',
              bio: 'Local fallback profile due to quota limit.',
              theme: 'system',
              plan: 'free',
              role: currentUser.email === 'mautrishakarar99@gmail.com' ? 'admin' : 'user',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            setIsAdmin(currentUser.email === 'mautrishakarar99@gmail.com');
          } else {
            try {
              handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
            } catch (e) {
              setAuthError(e as Error);
            }
          }
        }
        setLoading(false);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      throw error;
    }
  };

  const signupWithEmail = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const currentUser = userCredential.user;
      const docRef = doc(db, 'users', currentUser.uid);
      const newProfile = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: '',
        photoURL: '',
        bio: '',
        theme: 'system',
        plan: 'free',
        role: currentUser.email === 'mautrishakarar99@gmail.com' ? 'admin' : 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(docRef, newProfile);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
      }
    } catch (error) {
      throw error;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      throw error;
    }
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) return;
    
    // Optimistic update
    setProfile(prev => prev ? { ...prev, ...data } as UserProfile : null);
    
    try {
      const docRef = doc(db, 'users', user.uid);
      const updatedData = {
        ...data,
        updatedAt: serverTimestamp(),
      };
      await setDoc(docRef, updatedData, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const loginWithPinterest = async (token: string) => {
    try {
      // 1. Fetch Pinterest user profile
      const userRes = await fetch('/api/social/user_account', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!userRes.ok) {
        throw new Error('Failed to fetch Pinterest profile');
      }
      
      const userData = await userRes.json();
      const pinterestId = userData.id;
      const pinterestUsername = userData.username || `user_${pinterestId}`;
      
      if (!pinterestId) {
        throw new Error('Invalid Pinterest profile data');
      }

      // 2. Create deterministic email and password for Firebase Auth
      const email = `${pinterestId}@pinterest-oauth.local`;
      const password = `Pin_${pinterestId}_${pinterestUsername}!`;

      // 3. Try to sign in, or sign up if it doesn't exist
      let currentUser: User;
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          currentUser = userCredential.user;
          
          // Initialize profile for new user
          const docRef = doc(db, 'users', currentUser.uid);
          const newProfile = {
            uid: currentUser.uid,
            email: email,
            displayName: pinterestUsername,
            photoURL: userData.profile_image || '',
            bio: userData.about || '',
            theme: 'system',
            plan: 'free',
            role: email === 'mautrishakarar99@gmail.com' ? 'admin' : 'user',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          try {
            await setDoc(docRef, newProfile);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
          }
        } else {
          throw error;
        }
      }

      // 4. Update the user's profile to connect the Pinterest account
      const newAccount: PinterestAccount = {
        id: pinterestId,
        name: pinterestUsername,
        token: token
      };

      // We need to fetch the current profile to append the account, or just use arrayUnion if we had it.
      // Since we are in AuthContext, we can just update it directly.
      const docRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const currentData = docSnap.data() as UserProfile;
        const existingAccounts = currentData.pinterestAccounts || [];
        
        // Filter out if it already exists, then add the updated one
        const updatedAccounts = [
          ...existingAccounts.filter(a => a.id !== pinterestId),
          newAccount
        ];
        
        await setDoc(docRef, { 
          pinterestAccounts: updatedAccounts,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

    } catch (error) {
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading, loginWithGoogle, signupWithEmail, loginWithEmail, loginWithPinterest, logout, updateProfileData }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
