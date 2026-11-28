import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createDb();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
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

let quotaExceededState = false;
const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isFirestoreQuotaError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code).toLowerCase()
      : '';
  const msg =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error || '').toLowerCase();

  return (
    code === 'resource-exhausted' ||
    msg.includes('quota exceeded') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily read units')
  );
}

export function notifyQuotaExceeded(): void {
  if (quotaExceededState) return;
  quotaExceededState = true;
  quotaListeners.forEach((listener) => listener(true));
}

export function clearQuotaExceeded(): void {
  if (!quotaExceededState) return;
  quotaExceededState = false;
  quotaListeners.forEach((listener) => listener(false));
}

export function subscribeQuotaExceeded(listener: (exceeded: boolean) => void): () => void {
  quotaListeners.add(listener);
  listener(quotaExceededState);
  return () => {
    quotaListeners.delete(listener);
  };
}

function buildErrorInfo(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): FirestoreErrorInfo {
  return {
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
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) {
    notifyQuotaExceeded();
  }
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function handleSnapshotError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): void {
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  if (isFirestoreQuotaError(error)) {
    notifyQuotaExceeded();
    return;
  }
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      notifyQuotaExceeded();
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Firestore client appears offline.');
    }
  }
}

void testConnection();
