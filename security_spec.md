# Security Specification & Red-Team Audit

## 1. Data Invariants
1. **PII Isolation**: Private account records (`/users/{userId}`) containing `email` are strictly readable and writable only by `request.auth.uid == userId`. Public campus directory profiles (`/profiles/{userId}`) contain zero PII (`email`, `phone`, `address`).
2. **Ownership & Identity Integrity**: All personal subcollections (`/users/{userId}/tasks`, `/events`, `/enrollments`, `/studyLogs`, `/quizAttempts`) require `ownerId == request.auth.uid == userId` and existence of the parent `/users/{userId}` document on creation.
3. **Shared Course Resources**: `/pastQuestions` and `/studyMaterials` enforce `authorId == request.auth.uid` on create and restrict updates/deletes strictly to the original author. Private study materials (`visibility == 'private'`) are unreadable to non-authors.
4. **Peer Messaging Isolation**: Direct conversations (`/conversations/{conversationId}`) enforce a bounded 2-participant array (`participantIds.size() == 2`). Messages require parent conversation membership (`get(...)` on create/get) and carry the bounded `participantIds` copy so `allow list` checks `request.auth.uid in resource.data.participantIds` without performing O(n) `get()` lookups.
5. **Temporal Integrity & Anti-Update-Gap**: All `create` operations require `createdAt == request.time` (and `updatedAt == request.time` where applicable). Updates enforce `createdAt == existing().createdAt`, immutable `ownerId`/`authorId`/`uid`, strict `affectedKeys().hasOnly(...)` action sets, and `isValid[Entity](incoming())` schema/length checks.

6. **Chunked Attachment Integrity**: Large file attachments stored in `/pastQuestions/{questionId}/fileChunks/{chunkId}` and `/studyMaterials/{materialId}/fileChunks/{chunkId}` verify parent authorship via `get()` on create, bind `isReadablePublicly` strictly to parent visibility, cap chunk payload at 650,000 chars and `chunkIndex <= 250` (supporting up to 100 MB attachments), and enforce query-level filtering on `allow list` without `get()`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **PII Snooping (`GET /users/victim_uid`)**: Signed-in non-owner tries to read another student's `/users/{uid}` document -> `PERMISSION_DENIED`.
2. **Author Spoofing (`CREATE /pastQuestions/pq1`)**: Authenticated user sets `authorId: "someone_else"` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection (`CREATE /studyMaterials/m1`)**: Payload includes extra ghost field `isOfficial: true` -> `PERMISSION_DENIED` (`keys().hasOnly(...)` fails).
4. **Timestamp Forgery (`CREATE /users/{uid}/tasks/t1`)**: Client submits backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
5. **Unverified Account Write (`CREATE /pastQuestions/pq2`)**: Token with `email_verified: false` attempts write -> `PERMISSION_DENIED`.
6. **ID Poisoning (`CREATE /studyMaterials/<1500-char-id>`)**: Oversized or special-character document ID -> `PERMISSION_DENIED` (`isValidId` fails).
7. **Resource Exhaustion / Denial of Wallet (`CREATE /studyMaterials/m2`)**: `contentText` > 60,000 chars, `fileDataUrl` > 700,000 chars, or `fileChunkCount` > 250 -> `PERMISSION_DENIED`.
8. **Cross-Owner Subcollection Write (`CREATE /users/victim_uid/tasks/t2`)**: Attacker sets `ownerId: attacker_uid` inside victim's subcollection -> `PERMISSION_DENIED`.
9. **Chat Hijack (`CREATE /conversations/c1/messages/msg1`)**: Non-participant attempts to send message or spoof `participantIds` -> `PERMISSION_DENIED` (parent `get()` check fails).
10. **Private Material Leak (`GET /studyMaterials/private1` or `LIST /studyMaterials/private1/fileChunks`)**: Non-author reads private material or its `fileChunks` with `isReadablePublicly: false` -> `PERMISSION_DENIED`.
11. **Immutable Field Mutation (`UPDATE /pastQuestions/pq1`)**: Author attempts to change `authorId` or `createdAt` -> `PERMISSION_DENIED`.
12. **Unbounded Array Injection (`UPDATE /profiles/{uid}`)**: Student passes 50 course codes in `courses` array -> `PERMISSION_DENIED` (`courses.size() <= 15`).
