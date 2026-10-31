# Cadence Firestore Security Specification

## 1. Data Invariants

1. **Zero Blanket Access**: Default-deny catch-all at root (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Owner Isolation**: Every document in `/users/{userId}/likes/{trackId}` and `/users/{userId}/playlists/{playlistId}` can only be read, listed, created, updated, or deleted by an authenticated user with a verified email (`request.auth.token.email_verified == true`) whose `request.auth.uid == userId` and `ownerId == request.auth.uid`.
3. **Path-to-Payload ID Binding**:
   - In `/users/{userId}/likes/{trackId}`, `incoming().id == trackId` and `incoming().ownerId == userId`.
   - In `/users/{userId}/playlists/{playlistId}`, `incoming().id == playlistId` and `incoming().ownerId == userId`.
4. **Strict Key & Volumetric Boundaries**:
   - All strings have explicit `.size()` bounds matching `firebase-blueprint.json`.
   - Playlist `tracks` arrays are bounded to `size() <= 100`.
5. **Temporal Integrity & Immortal Fields**:
   - `createdAt` must equal `request.time` on creation and is immutable on update.
   - `updatedAt` must equal `request.time` on creation and update.
   - `id` and `ownerId` are strictly immutable after creation.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: `auth = null`, attempting `create` on `/users/u1/likes/t1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email_verified: false } }`, attempting `create` -> `PERMISSION_DENIED`.
3. **Cross-User Read/List Scrape**: `auth = { uid: 'attacker', email_verified: true }`, attempting `list` on `/users/victim/playlists` -> `PERMISSION_DENIED`.
4. **OwnerId Spoofing on Create**: `auth = { uid: 'u1' }`, payload has `ownerId: 'u2'` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection on Create**: Payload includes extra field `isAdmin: true` -> `PERMISSION_DENIED` via `keys().hasOnly()`.
6. **Shadow Field Injection on Update**: Updating a playlist with an extra field `featured: true` -> `PERMISSION_DENIED` via `affectedKeys().hasOnly()`.
7. **Immortal Field Mutation**: Updating `createdAt` or `ownerId` on an existing playlist -> `PERMISSION_DENIED`.
8. **Forged Client Timestamp**: Creating a liked song with a past/future `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Path ID Poisoning**: Creating `/users/u1/playlists/bad$id!` with non-alphanumeric characters or >128 chars -> `PERMISSION_DENIED` via `isValidId()`.
10. **Oversized String Denial-of-Wallet**: Creating a playlist with a 5,000-character `name` (max 100) -> `PERMISSION_DENIED`.
11. **Unbounded Array Exhaustion**: Updating a playlist with 150 items in `tracks` (max 100) -> `PERMISSION_DENIED`.
12. **Value Poisoning on Update**: Updating `name` with an integer `12345` instead of a bounded string -> `PERMISSION_DENIED` via `isValidPlaylist(incoming())`.
