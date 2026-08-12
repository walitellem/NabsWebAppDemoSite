import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, memoryLocalCache, deleteDoc, setDoc, updateDoc, addDoc, DocumentReference, DocumentData, CollectionReference, SetOptions, runTransaction, doc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey) {
  console.error("ERROR: VITE_FIREBASE_API_KEY is missing from environment variables.");
}

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
export const auth = getAuth(app);
export const isFirebaseConfigured = !!firebaseConfig.projectId;

export enum OperationType {
  READ = 'READ',
  WRITE = 'WRITE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

export const handleFirestoreError = (err: any, op: OperationType, path: string) => {
  console.error(`Firestore error in ${op} at ${path}:`, err);
};

export const safeFirestoreOp = async <T>(
  op: () => Promise<T>,
  fallback: T,
  timeoutMs?: number // Deprecated, Firestore SDK handles its own connection states
): Promise<T> => {
  try {
    return await op();
  } catch (error) {
    console.error("Firestore operation failed:", error);
    return fallback;
  }
};

export const safeDeleteDoc = async (docRef: DocumentReference): Promise<void> => {
  try {
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Firestore deleteDoc error:", error);
  }
};

const removeUndefined = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  const cleaned: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      cleaned[key] = removeUndefined(obj[key]);
    }
  }
  return cleaned;
};

export const safeSetDoc = async (docRef: DocumentReference, data: DocumentData, options?: SetOptions): Promise<void> => {
  try {
    await setDoc(docRef, removeUndefined(data), options as any);
  } catch (error) {
    console.error("Firestore setDoc error:", error);
  }
};

export const safeUpdateDoc = async (docRef: DocumentReference, data: DocumentData): Promise<void> => {
  try {
    await updateDoc(docRef, removeUndefined(data));
  } catch (error) {
    console.error("Firestore updateDoc error:", error);
  }
};

export const safeAddDoc = async (collectionRef: CollectionReference, data: DocumentData): Promise<string> => {
  try {
    const docRef = await addDoc(collectionRef, removeUndefined(data));
    return docRef.id;
  } catch (error) {
    console.error("Firestore addDoc error:", error);
    return "";
  }
};

export const safeRunTransaction = async <T>(
  updateFn: (transaction: any) => Promise<T>
): Promise<T | null> => {
  try {
    return await runTransaction(db, updateFn);
  } catch (error) {
    console.error("Firestore transaction error:", error);
    return null;
  }
};
