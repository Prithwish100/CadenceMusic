import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { FirestoreErrorInfo, OperationType, Track } from '../types/music';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Defensive payload sanitization matching firebase-blueprint.json constraints
export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function sanitizeId(rawId: string, maxLen = 64): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : 'track_default';
}

export function sanitizeString(str: string, maxLen: number, fallback = 'Unknown'): string {
  const trimmed = (str || '').trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : fallback.slice(0, maxLen);
}

export function sanitizeTrackForFirestore(track: Track): Track {
  const cleanId = sanitizeId(track.id, 64);
  return {
    id: cleanId,
    title: sanitizeString(track.title, 200, 'Untitled Track'),
    artist: sanitizeString(track.artist, 200, 'Unknown Artist'),
    album: sanitizeString(track.album, 200, 'Single'),
    duration: Math.max(0, Math.min(86400, Math.round(Number(track.duration) || 210))),
    thumbnailUrl: sanitizeString(
      track.thumbnailUrl,
      500,
      `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`
    ),
  };
}
