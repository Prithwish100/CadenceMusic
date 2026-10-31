import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  sanitizeId,
  sanitizeString,
  sanitizeTrackForFirestore,
} from '../lib/firebase';
import { CURATED_TRACKS } from '../data/curatedCatalog';
import { OperationType, Playlist, Track } from '../types/music';
import { isRunningInNativeApk } from '../utils/nativeStreamResolver';

declare global {
  interface Window {
    __cadenceCompleteNativeGoogleAuth?: (idToken?: string, accessToken?: string) => void;
    __cadenceEstablishNativeSession?: (sessionInput: unknown) => Promise<void>;
    __cadenceSetNativeAuthState?: (state: string, error?: string | null) => void;
    __cadencePendingSession?: unknown;
  }
}

interface NativeSessionUser {
  uid: string;
  email: string;
  displayName: string;
  firstName?: string;
  photoURL: string | null;
  idToken?: string;
  accessToken?: string;
  isNativeSession?: boolean;
  authMethod?: string;
}

type CadenceUser = User | NativeSessionUser;

interface LibraryContextValue {
  user: CadenceUser | null;
  isAuthReady: boolean;
  authError: string | null;
  authState?: string;
  profileName: string | null;
  profileAvatar: string | null;
  likedTracks: Track[];
  playlists: Playlist[];
  signInWithGoogle: (mode?: unknown) => Promise<void>;
  signOutUser: () => Promise<void>;
  updateProfileAvatar: (avatarDataUrl: string) => Promise<void>;
  updateProfileName: (newName: string) => Promise<void>;
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => Promise<void>;
  createPlaylist: (name: string, description: string, initialTrack?: Track) => Promise<string>;
  importPlaylist: (name: string, description: string, tracks: Track[]) => Promise<string>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}

const GUEST_LIKES_KEY = 'cadence_guest_likes_v1';
const GUEST_PLAYLISTS_KEY = 'cadence_guest_playlists_v1';
const CUSTOM_AVATAR_KEY = 'cadence_profile_avatar_v1';
const LEARNED_NAME_KEY = 'cadence_learned_name_v1';
const NATIVE_SESSION_KEY = 'cadence_native_auth_session_v1';

function readStoredNativeSession(): NativeSessionUser | null {
  try {
    const raw = localStorage.getItem(NATIVE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.uid && parsed.email) {
        return parsed as NativeSessionUser;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function extractNameFromUser(u: CadenceUser): string {
  if (u.displayName && u.displayName.trim().length > 0) {
    return u.displayName.trim().split(/\s+/)[0];
  }
  if (u.email) {
    const localPart = u.email.split('@')[0] || '';
    const cleaned = localPart.replace(/[0-9]+$/g, '').split(/[._-]+/)[0] || localPart;
    if (cleaned.length > 0) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
  return 'Listener';
}

const DEFAULT_GUEST_PLAYLISTS: Playlist[] = [
  {
    id: 'pl_sunset_drive',
    ownerId: 'guest',
    name: 'Sunset Horizon Mix',
    description: 'Warm synthwave, late-night grooves, and golden hour essentials.',
    tracks: CURATED_TRACKS.slice(0, 5),
  },
];

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CadenceUser | null>(() => readStoredNativeSession());
  const [isAuthReady, setIsAuthReady] = useState<boolean>(() => Boolean(readStoredNativeSession()));
  const [authError, setAuthError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<string>(() =>
    readStoredNativeSession() ? 'authenticated' : 'initialising'
  );

  const [customAvatar, setCustomAvatar] = useState<string | null>(() => {
    try {
      const ns = readStoredNativeSession();
      return (ns && ns.photoURL) || localStorage.getItem(CUSTOM_AVATAR_KEY) || null;
    } catch {
      return null;
    }
  });

  const [learnedName, setLearnedName] = useState<string | null>(() => {
    try {
      const ns = readStoredNativeSession();
      return (ns && (ns.displayName || ns.firstName)) || localStorage.getItem(LEARNED_NAME_KEY) || null;
    } catch {
      return null;
    }
  });

  const [guestLikes, setGuestLikes] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem(GUEST_LIKES_KEY);
      return saved ? JSON.parse(saved) : CURATED_TRACKS.slice(0, 3);
    } catch {
      return CURATED_TRACKS.slice(0, 3);
    }
  });

  const [guestPlaylists, setGuestPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem(GUEST_PLAYLISTS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_GUEST_PLAYLISTS;
    } catch {
      return DEFAULT_GUEST_PLAYLISTS;
    }
  });

  const [cloudLikes, setCloudLikes] = useState<Track[]>([]);
  const [cloudPlaylists, setCloudPlaylists] = useState<Playlist[]>([]);

  // Save guest state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(GUEST_LIKES_KEY, JSON.stringify(guestLikes));
    } catch (e) {
      console.error('Failed saving guest likes:', e);
    }
  }, [guestLikes]);

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_PLAYLISTS_KEY, JSON.stringify(guestPlaylists));
    } catch (e) {
      console.error('Failed saving guest playlists:', e);
    }
  }, [guestPlaylists]);

  const applyIncomingNativeSession = React.useCallback(async (sessInput: unknown) => {
    try {
      const sess = (
        typeof sessInput === 'string' ? JSON.parse(sessInput) : sessInput
      ) as Partial<NativeSessionUser> | null;
      if (!sess || !sess.email) return;

      setAuthError(null);
      const fullName =
        sess.displayName || sess.firstName || sess.email.split('@')[0] || 'Listener';
      const photo = sess.photoURL || null;
      const hash = Math.abs(
        sess.email
          .toLowerCase()
          .split('')
          .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
      );
      const normalized: NativeSessionUser = {
        uid: sess.uid || `google_${hash}`,
        email: sess.email,
        displayName: fullName,
        firstName: sess.firstName || fullName.split(/\s+/)[0] || 'Listener',
        photoURL: photo,
        isNativeSession: true,
        authMethod: sess.authMethod || 'external_browser_oauth_pkce',
      };

      try {
        localStorage.setItem(NATIVE_SESSION_KEY, JSON.stringify(normalized));
        localStorage.setItem(LEARNED_NAME_KEY, fullName);
        if (photo) {
          localStorage.setItem(CUSTOM_AVATAR_KEY, photo);
        }
      } catch {
        // ignore
      }

      setUser(normalized);
      setLearnedName(fullName);
      setCustomAvatar(photo);
      setIsAuthReady(true);
      setAuthState('authenticated');

      const idTok = sess.idToken && sess.idToken.trim() ? sess.idToken.trim() : null;
      const accTok = sess.accessToken && sess.accessToken.trim() ? sess.accessToken.trim() : null;
      if (idTok || accTok) {
        try {
          await signInWithCredential(auth, GoogleAuthProvider.credential(idTok, accTok));
        } catch {
          // Native session remains active even if Firebase client SDK credential exchange is skipped
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to establish Google session.';
      setAuthError(msg);
      setAuthState('auth_failed');
    }
  }, []);

  // Listen to Firebase Auth state + Native Android APK bridge state
  useEffect(() => {
    let mounted = true;

    const syncFromNativeBridge = () => {
      if (!isRunningInNativeApk()) return;
      fetch(`/api/native-auth-status?t=${Date.now()}`)
        .then((r) => r.json())
        .then((data) => {
          if (!mounted) return;
          if (data && data.authenticated && data.session && data.session.email) {
            applyIncomingNativeSession(data.session);
          }
        })
        .catch(() => {});
    };

    syncFromNativeBridge();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        syncFromNativeBridge();
      }
    };
    window.addEventListener('focus', syncFromNativeBridge);
    document.addEventListener('visibilitychange', onVis);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const extracted = extractNameFromUser(currentUser);
        const sess: NativeSessionUser = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || extracted || 'Listener',
          firstName: (currentUser.displayName || extracted || 'Listener').split(/\s+/)[0],
          photoURL: currentUser.photoURL || null,
          isNativeSession: false,
        };
        try {
          localStorage.setItem(NATIVE_SESSION_KEY, JSON.stringify(sess));
          localStorage.setItem(LEARNED_NAME_KEY, sess.displayName);
          if (sess.photoURL) {
            localStorage.setItem(CUSTOM_AVATAR_KEY, sess.photoURL);
          }
        } catch {
          // ignore
        }
        setUser(currentUser);
        setLearnedName((prev) => prev || sess.displayName);
        if (currentUser.photoURL) {
          setCustomAvatar((prev) => prev || currentUser.photoURL);
        }
        setIsAuthReady(true);
        setAuthState('authenticated');
      } else {
        const ns = readStoredNativeSession();
        if (ns) {
          setUser(ns);
          setLearnedName(ns.displayName || ns.firstName || 'Listener');
          setCustomAvatar(ns.photoURL || null);
          setIsAuthReady(true);
          setAuthState('authenticated');
        } else {
          setUser(null);
          setLearnedName(null);
          setCustomAvatar(null);
          setIsAuthReady(true);
          setAuthState('signed_out');
        }
      }
    });

    return () => {
      mounted = false;
      window.removeEventListener('focus', syncFromNativeBridge);
      document.removeEventListener('visibilitychange', onVis);
      unsubscribe();
    };
  }, [applyIncomingNativeSession]);

  // Attach Firestore listeners when authenticated with Firebase
  useEffect(() => {
    if (
      !isAuthReady ||
      !user ||
      ('isNativeSession' in user && user.isNativeSession) ||
      !auth.currentUser
    ) {
      setCloudLikes([]);
      setCloudPlaylists([]);
      return;
    }

    const profileDocRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(
      profileDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.displayName === 'string' && data.displayName.trim()) {
            setLearnedName(data.displayName.trim());
            try {
              localStorage.setItem(LEARNED_NAME_KEY, data.displayName.trim());
            } catch {
              // ignore
            }
          }
          if (typeof data.avatarUrl === 'string') {
            const avatarVal = data.avatarUrl || null;
            setCustomAvatar(avatarVal);
            try {
              if (avatarVal) {
                localStorage.setItem(CUSTOM_AVATAR_KEY, avatarVal);
              } else {
                localStorage.removeItem(CUSTOM_AVATAR_KEY);
              }
            } catch {
              // ignore
            }
          }
        } else {
          const initialName = sanitizeString(extractNameFromUser(user), 100, 'Listener');
          const initialAvatar = customAvatar || '';
          setDoc(profileDocRef, {
            ownerId: user.uid,
            displayName: initialName,
            avatarUrl: initialAvatar.slice(0, 340000),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      },
      () => {}
    );

    const likesPath = `users/${user.uid}/likes`;
    const likesQuery = query(collection(db, likesPath), where('ownerId', '==', user.uid));

    const unsubLikes = onSnapshot(
      likesQuery,
      (snapshot) => {
        const items: Track[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: data.id,
            title: data.title,
            artist: data.artist,
            album: data.album,
            duration: data.duration,
            thumbnailUrl: data.thumbnailUrl,
          };
        });
        setCloudLikes(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, likesPath);
      }
    );

    const playlistsPath = `users/${user.uid}/playlists`;
    const playlistsQuery = query(collection(db, playlistsPath), where('ownerId', '==', user.uid));

    const unsubPlaylists = onSnapshot(
      playlistsQuery,
      (snapshot) => {
        const items: Playlist[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: data.id,
            ownerId: data.ownerId,
            name: data.name,
            description: data.description || '',
            tracks: Array.isArray(data.tracks) ? data.tracks : [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setCloudPlaylists(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, playlistsPath);
      }
    );

    return () => {
      unsubProfile();
      unsubLikes();
      unsubPlaylists();
    };
  }, [isAuthReady, user]);

  // Handle Google OAuth token & session handoff inside the native Android APK (from external browser deep link)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.__cadenceSetNativeAuthState = (st: string, err?: string | null) => {
      if (st) setAuthState(st);
      if (err) {
        setAuthError(err);
        setAuthState('auth_failed');
      } else if (st === 'signing_in' || st === 'authenticated') {
        setAuthError(null);
      }
    };

    window.__cadenceEstablishNativeSession = applyIncomingNativeSession;

    window.__cadenceCompleteNativeGoogleAuth = async (idToken?: string, accessToken?: string) => {
      setAuthError(null);
      setAuthState('signing_in');
      try {
        await fetch(
          `/api/native-auth-complete?id_token=${encodeURIComponent(idToken || '')}&access_token=${encodeURIComponent(accessToken || '')}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to complete Google sign-in.';
        setAuthError(msg);
        setAuthState('auth_failed');
      }
    };

    const onNativeAuthEvt = (ev: Event) => {
      const customEv = ev as CustomEvent;
      if (customEv && customEv.detail) {
        applyIncomingNativeSession(customEv.detail);
      }
    };
    window.addEventListener('cadence-native-auth', onNativeAuthEvt);

    if (window.__cadencePendingSession) {
      const pending = window.__cadencePendingSession;
      delete window.__cadencePendingSession;
      applyIncomingNativeSession(pending);
    }

    return () => {
      window.removeEventListener('cadence-native-auth', onNativeAuthEvt);
      delete window.__cadenceSetNativeAuthState;
      delete window.__cadenceEstablishNativeSession;
      delete window.__cadenceCompleteNativeGoogleAuth;
    };
  }, [applyIncomingNativeSession]);

  const signInWithGoogle = async (mode?: unknown) => {
    setAuthError(null);
    setAuthState('signing_in');
    const authMode = typeof mode === 'string' && mode === 'native' ? 'native' : 'browser';
    if (isRunningInNativeApk()) {
      try {
        await fetch(`/api/native-auth-start?mode=${authMode}&t=${Date.now()}`);
      } catch {
        setAuthError('Failed to start external browser Google sign-in.');
        setAuthState('auth_failed');
      }
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      setAuthState('authenticated');
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('apk_auth') === '1') {
          const cred = GoogleAuthProvider.credentialFromResult(result);
          const idTok = cred?.idToken || '';
          const accTok = cred?.accessToken || '';
          if (idTok || accTok) {
            window.location.href = `intent://auth?id_token=${encodeURIComponent(idTok)}&access_token=${encodeURIComponent(accTok)}#Intent;scheme=cadence;package=app.cadence.flutter.test;end`;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled or failed.';
      setAuthError(msg);
      setAuthState('auth_failed');
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    try {
      if (isRunningInNativeApk()) {
        await fetch(`/api/native-auth-signout?t=${Date.now()}`).catch(() => {});
      }
      await signOut(auth).catch(() => {});
    } finally {
      setUser(null);
      setLearnedName(null);
      setCustomAvatar(null);
      setCloudLikes([]);
      setCloudPlaylists([]);
      setAuthState('signed_out');
      try {
        localStorage.removeItem(NATIVE_SESSION_KEY);
        localStorage.removeItem(LEARNED_NAME_KEY);
        localStorage.removeItem(CUSTOM_AVATAR_KEY);
      } catch {
        // ignore
      }
    }
  };

  const useCloud = Boolean(
    user && !('isNativeSession' in user && user.isNativeSession) && auth.currentUser && cloudLikes.length > 0
  );
  const likedTracks = useCloud ? cloudLikes : guestLikes;
  const playlists = Boolean(
    user && !('isNativeSession' in user && user.isNativeSession) && auth.currentUser && cloudPlaylists.length > 0
  )
    ? cloudPlaylists
    : guestPlaylists;

  const isLiked = (trackId: string): boolean => {
    const cleanId = sanitizeId(trackId, 64);
    return likedTracks.some((t) => t.id === cleanId || t.id === trackId);
  };

  const toggleLike = async (track: Track) => {
    const cleanTrack = sanitizeTrackForFirestore(track);

    if (!user) {
      setGuestLikes((prev) => {
        const exists = prev.some((t) => t.id === cleanTrack.id);
        return exists ? prev.filter((t) => t.id !== cleanTrack.id) : [cleanTrack, ...prev];
      });
      return;
    }

    const docPath = `users/${user.uid}/likes/${cleanTrack.id}`;
    const docRef = doc(db, 'users', user.uid, 'likes', cleanTrack.id);
    const currentlyLiked = cloudLikes.some((t) => t.id === cleanTrack.id);

    if (currentlyLiked) {
      try {
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      }
    } else {
      try {
        await setDoc(docRef, {
          id: cleanTrack.id,
          ownerId: user.uid,
          title: cleanTrack.title,
          artist: cleanTrack.artist,
          album: cleanTrack.album,
          duration: cleanTrack.duration,
          thumbnailUrl: cleanTrack.thumbnailUrl,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    }
  };

  const createPlaylist = async (
    name: string,
    description: string,
    initialTrack?: Track
  ): Promise<string> => {
    const playlistId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanName = sanitizeString(name, 100, 'My Sunset Playlist');
    const cleanDesc = (description || '').trim().slice(0, 300);
    const initialTracks = initialTrack ? [sanitizeTrackForFirestore(initialTrack)] : [];

    if (!user) {
      const newPl: Playlist = {
        id: playlistId,
        ownerId: 'guest',
        name: cleanName,
        description: cleanDesc,
        tracks: initialTracks,
      };
      setGuestPlaylists((prev) => [newPl, ...prev]);
      return playlistId;
    }

    const docPath = `users/${user.uid}/playlists/${playlistId}`;
    const docRef = doc(db, 'users', user.uid, 'playlists', playlistId);

    try {
      await setDoc(docRef, {
        id: playlistId,
        ownerId: user.uid,
        name: cleanName,
        description: cleanDesc,
        tracks: initialTracks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return playlistId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  };

  const importPlaylist = async (
    name: string,
    description: string,
    tracks: Track[]
  ): Promise<string> => {
    const playlistId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanName = sanitizeString(name, 100, 'Imported Playlist');
    const cleanDesc = (description || '').trim().slice(0, 300);
    const sanitizedTracks = (Array.isArray(tracks) ? tracks : [])
      .map(sanitizeTrackForFirestore)
      .slice(0, 100);

    if (!user) {
      const newPl: Playlist = {
        id: playlistId,
        ownerId: 'guest',
        name: cleanName,
        description: cleanDesc,
        tracks: sanitizedTracks,
      };
      setGuestPlaylists((prev) => [newPl, ...prev]);
      return playlistId;
    }

    const docPath = `users/${user.uid}/playlists/${playlistId}`;
    const docRef = doc(db, 'users', user.uid, 'playlists', playlistId);

    try {
      await setDoc(docRef, {
        id: playlistId,
        ownerId: user.uid,
        name: cleanName,
        description: cleanDesc,
        tracks: sanitizedTracks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return playlistId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    const cleanPlaylistId = sanitizeId(playlistId, 128);
    if (!user) {
      setGuestPlaylists((prev) => prev.filter((p) => p.id !== cleanPlaylistId));
      return;
    }

    const docPath = `users/${user.uid}/playlists/${cleanPlaylistId}`;
    const docRef = doc(db, 'users', user.uid, 'playlists', cleanPlaylistId);
    try {
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  };

  const addTrackToPlaylist = async (playlistId: string, track: Track) => {
    const cleanPlaylistId = sanitizeId(playlistId, 128);
    const cleanTrack = sanitizeTrackForFirestore(track);

    if (!user) {
      setGuestPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== cleanPlaylistId) return pl;
          if (pl.tracks.some((t) => t.id === cleanTrack.id)) return pl;
          return {
            ...pl,
            tracks: [...pl.tracks, cleanTrack].slice(0, 100),
          };
        })
      );
      return;
    }

    const target = cloudPlaylists.find((p) => p.id === cleanPlaylistId);
    if (!target) return;
    if (target.tracks.some((t) => t.id === cleanTrack.id)) return;

    const updatedTracks = [...target.tracks.map(sanitizeTrackForFirestore), cleanTrack].slice(0, 100);
    const docPath = `users/${user.uid}/playlists/${cleanPlaylistId}`;
    const docRef = doc(db, 'users', user.uid, 'playlists', cleanPlaylistId);

    try {
      await updateDoc(docRef, {
        tracks: updatedTracks,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    const cleanPlaylistId = sanitizeId(playlistId, 128);
    const cleanTrackId = sanitizeId(trackId, 64);

    if (!user) {
      setGuestPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== cleanPlaylistId) return pl;
          return {
            ...pl,
            tracks: pl.tracks.filter((t) => t.id !== cleanTrackId && t.id !== trackId),
          };
        })
      );
      return;
    }

    const target = cloudPlaylists.find((p) => p.id === cleanPlaylistId);
    if (!target) return;

    const updatedTracks = target.tracks
      .filter((t) => t.id !== cleanTrackId && t.id !== trackId)
      .map(sanitizeTrackForFirestore);

    const docPath = `users/${user.uid}/playlists/${cleanPlaylistId}`;
    const docRef = doc(db, 'users', user.uid, 'playlists', cleanPlaylistId);

    try {
      await updateDoc(docRef, {
        tracks: updatedTracks,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  };

  const updateProfileAvatar = async (avatarDataUrl: string) => {
    const cleanUrl = (avatarDataUrl || '').slice(0, 340000);
    setCustomAvatar(cleanUrl || null);
    try {
      if (cleanUrl) {
        localStorage.setItem(CUSTOM_AVATAR_KEY, cleanUrl);
      } else {
        localStorage.removeItem(CUSTOM_AVATAR_KEY);
      }
      const ns = readStoredNativeSession();
      if (ns) {
        ns.photoURL = cleanUrl || null;
        localStorage.setItem(NATIVE_SESSION_KEY, JSON.stringify(ns));
        setUser({ ...ns });
      }
    } catch {
      // ignore storage error
    }

    if (isRunningInNativeApk()) {
      fetch(`/api/native-auth-update-profile?avatar=${encodeURIComponent(cleanUrl)}`).catch(() => {});
    }

    if (user && !('isNativeSession' in user && user.isNativeSession) && auth.currentUser) {
      const currentName = sanitizeString(
        learnedName || extractNameFromUser(user),
        100,
        'Listener'
      );
      const profileDocRef = doc(db, 'users', user.uid);
      try {
        await setDoc(profileDocRef, {
          ownerId: user.uid,
          displayName: currentName,
          avatarUrl: cleanUrl,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      }
    }
  };

  const updateProfileName = async (newName: string) => {
    const cleanName = sanitizeString(newName, 100, user ? extractNameFromUser(user) : 'Listener');
    setLearnedName(cleanName);
    try {
      localStorage.setItem(LEARNED_NAME_KEY, cleanName);
      const ns = readStoredNativeSession();
      if (ns) {
        ns.displayName = cleanName;
        ns.firstName = cleanName.split(/\s+/)[0] || cleanName;
        localStorage.setItem(NATIVE_SESSION_KEY, JSON.stringify(ns));
        setUser({ ...ns });
      }
    } catch {
      // ignore storage error
    }

    if (isRunningInNativeApk()) {
      fetch(`/api/native-auth-update-profile?name=${encodeURIComponent(cleanName)}`).catch(() => {});
    }

    if (user && !('isNativeSession' in user && user.isNativeSession) && auth.currentUser) {
      const profileDocRef = doc(db, 'users', user.uid);
      try {
        await setDoc(profileDocRef, {
          ownerId: user.uid,
          displayName: cleanName,
          avatarUrl: (customAvatar || '').slice(0, 340000),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      }
    }
  };

  const profileName = user
    ? learnedName || user.displayName || extractNameFromUser(user)
    : null;

  const profileAvatar = user
    ? customAvatar || user.photoURL || null
    : null;

  return (
    <LibraryContext.Provider
      value={{
        user,
        isAuthReady,
        authError,
        authState,
        profileName,
        profileAvatar,
        likedTracks,
        playlists,
        signInWithGoogle,
        signOutUser,
        updateProfileAvatar,
        updateProfileName,
        isLiked,
        toggleLike,
        createPlaylist,
        importPlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
};

export const useLibrary = (): LibraryContextValue => {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
};

