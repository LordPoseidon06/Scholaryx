import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export const FILE_CHUNK_CHAR_SIZE = 600000;
const BATCH_CHUNK_LIMIT = 4; // 4 * 600 KB = 2.4 MB per batch (safely under Firestore's 10 MiB request limit)

export function splitDataUrlIntoChunks(dataUrl: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += FILE_CHUNK_CHAR_SIZE) {
    chunks.push(dataUrl.slice(i, i + FILE_CHUNK_CHAR_SIZE));
  }
  return chunks;
}

export async function uploadFileChunks(
  parentCollection: 'pastQuestions' | 'studyMaterials',
  docId: string,
  dataUrl: string,
  authorId: string,
  isReadablePublicly: boolean,
  onProgress?: (uploaded: number, total: number) => void
): Promise<number> {
  const chunks = splitDataUrlIntoChunks(dataUrl);
  if (chunks.length > 250) {
    throw new Error('Encoded file exceeds the maximum 100 MB chunk limit.');
  }

  let uploaded = 0;
  for (let start = 0; start < chunks.length; start += BATCH_CHUNK_LIMIT) {
    const batch = writeBatch(db);
    const slice = chunks.slice(start, start + BATCH_CHUNK_LIMIT);
    slice.forEach((chunkData, offset) => {
      const idx = start + offset;
      const chunkRef = doc(db, parentCollection, docId, 'fileChunks', `chunk_${idx}`);
      batch.set(chunkRef, {
        authorId,
        chunkIndex: idx,
        data: chunkData,
        isReadablePublicly,
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${parentCollection}/${docId}/fileChunks`);
    }

    uploaded += slice.length;
    onProgress?.(uploaded, chunks.length);
  }

  return chunks.length;
}

export async function loadAttachmentDataUrl(
  parentCollection: 'pastQuestions' | 'studyMaterials',
  docId: string,
  options: {
    inlineDataUrl?: string;
    chunkCount?: number;
    isPubliclyReadable: boolean;
    currentUserId?: string;
    authorId: string;
  }
): Promise<string> {
  if (options.inlineDataUrl) return options.inlineDataUrl;
  if (!options.chunkCount || options.chunkCount <= 0) return '';

  const chunksCol = collection(db, parentCollection, docId, 'fileChunks');
  const filterConstraint =
    options.currentUserId && options.authorId === options.currentUserId
      ? where('authorId', '==', options.currentUserId)
      : where('isReadablePublicly', '==', true);

  try {
    const snap = await getDocs(query(chunksCol, filterConstraint));
    const ordered = snap.docs
      .map((d) => d.data() as { chunkIndex: number; data: string })
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
    return ordered.map((c) => c.data).join('');
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${parentCollection}/${docId}/fileChunks`);
  }
}

export async function deleteFileChunks(
  parentCollection: 'pastQuestions' | 'studyMaterials',
  docId: string,
  authorId: string,
  chunkCount?: number
): Promise<void> {
  if (!chunkCount || chunkCount <= 0) return;
  const chunksCol = collection(db, parentCollection, docId, 'fileChunks');
  try {
    const snap = await getDocs(query(chunksCol, where('authorId', '==', authorId)));
    if (snap.empty) return;
    for (let i = 0; i < snap.docs.length; i += 200) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 200).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${parentCollection}/${docId}/fileChunks`);
  }
}
