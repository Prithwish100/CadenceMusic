import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
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

interface LibraryContextValue {
  user: User | null;
  isAuthReady: boolean;
  authError: string | null;
  likedTracks: Track[];
  playlists: Playlist[];
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => Promise<void>;
  createPlaylist: (name: string, description: string, initialTrack?: Track) => Promise<string>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}

const GUEST_LIKES_KEY = 'cadence_guest_likes_v1';
const GUEST_PLAYLISTS_KEY = 'cadence_guest_playlists_v1';

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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Attach Firestore listeners when authenticated
  useEffect(() => {
    if (!isAuthReady || !user) {
      setCloudLikes([]);
      setCloudPlaylists([]);
      return;
    }

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
      unsubLikes();
      unsubPlaylists();
    };
  }, [isAuthReady, user]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled or failed.';
      setAuthError(msg);
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign out.';
      setAuthError(msg);
    }
  };

  const likedTracks = user ? cloudLikes : guestLikes;
  const playlists = user ? cloudPlaylists : guestPlaylists;

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

  return (
    <LibraryContext.Provider
      value={{
        user,
        isAuthReady,
        authError,
        likedTracks,
        playlists,
        signInWithGoogle,
        signOutUser,
        isLiked,
        toggleLike,
        createPlaylist,
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
