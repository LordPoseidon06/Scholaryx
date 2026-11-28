import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { clampString } from './utils';
import type { AnnouncementTone, MaterialVisibility } from '../types';

export const ADMIN_EMAIL = 'samueloffei2006@gmail.com';
export const ADMIN_DISPLAY_EMAIL = 'Samueloffei2006@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function isVerifiedAdmin(user: User | null | undefined): boolean {
  return Boolean(user && user.emailVerified && isAdminEmail(user.email));
}

async function deleteAllDocsInSubcollection(pathSegments: [string, ...string[]]): Promise<void> {
  const path = pathSegments.join('/');
  try {
    const snap = await getDocs(collection(db, ...pathSegments));
    if (snap.empty) return;
    for (let i = 0; i < snap.docs.length; i += 200) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 200).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function blockUserAccount(params: {
  adminUid: string;
  targetUid: string;
  email?: string;
  displayName?: string;
  reason?: string;
}): Promise<void> {
  if (!params.targetUid || params.targetUid === params.adminUid || isAdminEmail(params.email)) {
    throw new Error('Administrator account cannot be blocked.');
  }

  const path = `blockedUsers/${params.targetUid}`;
  const payload: Record<string, unknown> = {
    uid: params.targetUid,
    blockedBy: params.adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.email) payload.email = clampString(params.email, 200);
  if (params.displayName) payload.displayName = clampString(params.displayName, 120);
  if (params.reason && params.reason.trim()) payload.reason = clampString(params.reason, 500);

  try {
    await setDoc(doc(db, 'blockedUsers', params.targetUid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function unblockUserAccount(targetUid: string): Promise<void> {
  const path = `blockedUsers/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'blockedUsers', targetUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function adminDeleteStudyMaterial(materialId: string): Promise<void> {
  await deleteAllDocsInSubcollection(['studyMaterials', materialId, 'fileChunks']);
  await deleteAllDocsInSubcollection(['studyMaterials', materialId, 'annotations']);
  try {
    await deleteDoc(doc(db, 'studyMaterials', materialId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `studyMaterials/${materialId}`);
  }
}

export async function adminUpdateStudyMaterialVisibility(
  materialId: string,
  visibility: MaterialVisibility,
  chunkCount?: number
): Promise<void> {
  const path = `studyMaterials/${materialId}`;
  try {
    await updateDoc(doc(db, 'studyMaterials', materialId), {
      visibility,
      updatedAt: serverTimestamp(),
    });
    if (chunkCount && chunkCount > 0) {
      const snap = await getDocs(collection(db, 'studyMaterials', materialId, 'fileChunks'));
      if (!snap.empty) {
        const readable = visibility !== 'private';
        for (let i = 0; i < snap.docs.length; i += 200) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 200).forEach((d) => batch.update(d.ref, { isReadablePublicly: readable }));
          await batch.commit();
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminDeletePastQuestion(questionId: string): Promise<void> {
  await deleteAllDocsInSubcollection(['pastQuestions', questionId, 'fileChunks']);
  await deleteAllDocsInSubcollection(['pastQuestions', questionId, 'comments']);
  try {
    await deleteDoc(doc(db, 'pastQuestions', questionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `pastQuestions/${questionId}`);
  }
}

export async function adminUpdatePastQuestionVisibility(
  questionId: string,
  isPublic: boolean,
  chunkCount?: number
): Promise<void> {
  const path = `pastQuestions/${questionId}`;
  try {
    await updateDoc(doc(db, 'pastQuestions', questionId), {
      isPublic,
      updatedAt: serverTimestamp(),
    });
    if (chunkCount && chunkCount > 0) {
      const snap = await getDocs(collection(db, 'pastQuestions', questionId, 'fileChunks'));
      if (!snap.empty) {
        for (let i = 0; i < snap.docs.length; i += 200) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 200).forEach((d) => batch.update(d.ref, { isReadablePublicly: isPublic }));
          await batch.commit();
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminDeletePastQuestionComment(questionId: string, commentId: string): Promise<void> {
  const path = `pastQuestions/${questionId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'pastQuestions', questionId, 'comments', commentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function adminDeleteConversation(conversationId: string): Promise<void> {
  await deleteAllDocsInSubcollection(['conversations', conversationId, 'messages']);
  try {
    await deleteDoc(doc(db, 'conversations', conversationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `conversations/${conversationId}`);
  }
}

export async function adminDeleteConversationMessage(
  conversationId: string,
  messageId: string
): Promise<void> {
  const path = `conversations/${conversationId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'conversations', conversationId, 'messages', messageId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function removeUserAccountData(params: {
  adminUid: string;
  targetUid: string;
  targetEmail?: string;
  targetDisplayName?: string;
  purgePublicContent?: boolean;
  alsoBlock?: boolean;
  blockReason?: string;
}): Promise<void> {
  const { adminUid, targetUid, targetEmail, targetDisplayName, purgePublicContent, alsoBlock, blockReason } = params;

  if (!targetUid || targetUid === adminUid || isAdminEmail(targetEmail)) {
    throw new Error('Administrator account cannot be removed.');
  }

  if (alsoBlock) {
    await blockUserAccount({
      adminUid,
      targetUid,
      email: targetEmail,
      displayName: targetDisplayName,
      reason: blockReason || 'Account removed and blocked by administrator.',
    });
  }

  // Delete personal workspace subcollections
  const personalSubcollections = ['enrollments', 'tasks', 'events', 'studyLogs', 'quizAttempts'] as const;
  for (const sub of personalSubcollections) {
    await deleteAllDocsInSubcollection(['users', targetUid, sub]);
  }

  // Optionally purge all content authored by or involving the user
  if (purgePublicContent) {
    try {
      const matSnap = await getDocs(
        query(collection(db, 'studyMaterials'), where('authorId', '==', targetUid))
      );
      for (const mDoc of matSnap.docs) {
        await adminDeleteStudyMaterial(mDoc.id);
      }

      const pqSnap = await getDocs(
        query(collection(db, 'pastQuestions'), where('authorId', '==', targetUid))
      );
      for (const qDoc of pqSnap.docs) {
        await adminDeletePastQuestion(qDoc.id);
      }

      const convSnap = await getDocs(
        query(collection(db, 'conversations'), where('participantIds', 'array-contains', targetUid))
      );
      for (const cDoc of convSnap.docs) {
        await adminDeleteConversation(cDoc.id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `purgePublicContent/${targetUid}`);
    }
  }

  try {
    await deleteDoc(doc(db, 'profiles', targetUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `profiles/${targetUid}`);
  }

  try {
    await deleteDoc(doc(db, 'users', targetUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${targetUid}`);
  }
}

export async function adminSavePlatformConfig(
  adminUid: string,
  config: {
    announcementTitle: string;
    announcementBody: string;
    announcementTone: AnnouncementTone;
    isActive: boolean;
  }
): Promise<void> {
  const path = 'appConfig/platform';
  try {
    await setDoc(doc(db, 'appConfig', 'platform'), {
      announcementTitle: clampString(config.announcementTitle, 120),
      announcementBody: clampString(config.announcementBody, 500),
      announcementTone: config.announcementTone,
      isActive: Boolean(config.isActive),
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
