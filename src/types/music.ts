export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export enum RepeatMode {
  OFF = 'off',
  ALL = 'all',
  ONE = 'one',
}

export enum ActiveView {
  HOME = 'home',
  SEARCH = 'search',
  LIKED = 'liked',
  PLAYLISTS = 'playlists',
  PLAYLIST_DETAIL = 'playlist_detail',
  PROFILE = 'profile',
  ABOUT = 'about',
}

export interface Track {
  id: string; // YouTube Video ID
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  thumbnailUrl: string;
  category?: string;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface Playlist {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  tracks: Track[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
