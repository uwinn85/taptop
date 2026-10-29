import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

export type ViewState = 'rating' | 'positive' | 'negative' | 'thanks' | 'inactive';
export type AppMode = 'client' | 'admin_login' | 'admin_dashboard';
export type AdminTab = 'qr' | 'page' | 'security' | 'feedback';
export type UserRole = 'superadmin' | 'branch_admin';

export interface AdminProfile {
  role: UserRole;
  branchId?: string;
}

export interface Feedback {
  id: string;
  branchId: string;
  rating: number;
  message: string;
  date: string;
  status: 'new' | 'resolved';
}

export interface StoreReview {
  id: string;
  branchId: string;
  rating: number;
  message: string;
  date: string;
}

export interface Branch {
  id: string;
  name: string;
  activationCode: string;
  publicAppUrl: string;
  reviewUrl: string;
  qrColor: string;
  qrBgColor: string;
  isActive: boolean;
  adminWhatsapp: string;
}

export interface PageSettings {
  title: string;
  subtitle: string;
  positiveTitle: string;
  positiveText: string;
  positiveButtonText: string;
  negativeTitle: string;
  negativeText: string;
  negativePlaceholder: string;
  negativeButtonText: string;
  thanksTitle: string;
  thanksText: string;
  thanksButtonText: string;
}

export interface AppConfig {
  branches: Branch[];
  pageSettings: PageSettings;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abc123',
};

export const isFirebaseReady = Boolean(
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_APP_ID
);

const app = getApps().find((candidate) => candidate.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const activationApp = getApps().find((candidate) => candidate.name === 'store-activation') ?? initializeApp(firebaseConfig, 'store-activation');
const storeApp = getApps().find((candidate) => candidate.name === 'store-access') ?? initializeApp(firebaseConfig, 'store-access');

export const auth = getAuth(app);
export const db = getFirestore(app);
export const activationAuth = getAuth(activationApp);
export const activationDb = getFirestore(activationApp);
export const storeAuth = getAuth(storeApp);
export const storeDb = getFirestore(storeApp);

export function storeAuthEmailForCode(activationCode: string) {
  const safeCode = activationCode.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `store.${safeCode}@stores.taptop.app`;
}

export const defaultConfig: AppConfig = {
  branches: [
    {
      id: 'UTAMA1',
      name: 'Cabang Utama (Pusat)',
      activationCode: '',
      publicAppUrl: 'https://toko-anda.com/feedback?branch=UTAMA1',
      reviewUrl: 'https://g.page/r/example/review',
      qrColor: '#4F46E5',
      qrBgColor: '#FFFFFF',
      isActive: true,
      adminWhatsapp: '6281234567890',
    },
    {
      id: 'CABANG2',
      name: 'Cabang Baru (Belum Aktif)',
      activationCode: '',
      publicAppUrl: 'https://toko-anda.com/feedback?branch=CABANG2',
      reviewUrl: '',
      qrColor: '#4F46E5',
      qrBgColor: '#FFFFFF',
      isActive: false,
      adminWhatsapp: '6281234567890',
    },
  ],
  pageSettings: {
    title: 'Halo! 👋',
    subtitle: 'Cerita luar biasa Anda adalah penyambung nyawa bisnis kami. Berikan 5 bintang terbaik anda',
    positiveTitle: 'Kami Senang Anda Puas! 🎉',
    positiveText: 'Selangkah lagi untuk Sempurnakan momen luar biasa anda hari ini, untuk menginspirasi dunia di Google',
    positiveButtonText: 'Beri Ulasan di Google',
    negativeTitle: 'Mohon Maaf Atas Ketidaknyamanan Ini',
    negativeText: 'Bantu kami menjadi lebih baik. Ceritakan apa yang kurang memuaskan dari layanan kami.',
    negativePlaceholder: 'Ketik masukan Anda di sini...',
    negativeButtonText: 'Kirim Masukan',
    thanksTitle: 'Terima Kasih!',
    thanksText: 'Masukan Anda telah kami terima dan akan langsung diteruskan ke tim manajemen kami.',
    thanksButtonText: 'Selesai',
  },
};

export const appConfigRef = doc(db, 'app', 'publicConfig');
export const legacyAppConfigRef = doc(db, 'app', 'config');
export const feedbackCollectionRef = collection(db, 'feedbacks');

const adminProfilesCollectionRef = collection(db, 'adminUsers');

const normalizeAppConfig = (value: unknown): AppConfig => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawBranches = Array.isArray(raw.branches) ? raw.branches : defaultConfig.branches;
  const branches = rawBranches.map((value, index) => {
    const branch = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const fallback = defaultConfig.branches[index % defaultConfig.branches.length];
    return {
      id: typeof branch.id === 'string' ? branch.id : fallback.id,
      name: typeof branch.name === 'string' ? branch.name : fallback.name,
      activationCode: typeof branch.activationCode === 'string' ? branch.activationCode : '',
      publicAppUrl: typeof branch.publicAppUrl === 'string' ? branch.publicAppUrl : fallback.publicAppUrl,
      reviewUrl: typeof branch.reviewUrl === 'string' ? branch.reviewUrl : '',
      qrColor: typeof branch.qrColor === 'string' ? branch.qrColor : fallback.qrColor,
      qrBgColor: typeof branch.qrBgColor === 'string' ? branch.qrBgColor : fallback.qrBgColor,
      isActive: typeof branch.isActive === 'boolean' ? branch.isActive : false,
      adminWhatsapp: typeof branch.adminWhatsapp === 'string' ? branch.adminWhatsapp : fallback.adminWhatsapp,
    };
  });
  const rawPageSettings = raw.pageSettings && typeof raw.pageSettings === 'object'
    ? raw.pageSettings as Record<string, unknown>
    : {};
  const pageSettings = Object.fromEntries(
    Object.entries(defaultConfig.pageSettings).map(([key, fallback]) => [
      key,
      typeof rawPageSettings[key] === 'string' ? rawPageSettings[key] : fallback,
    ])
  ) as PageSettings;

  return {
    branches: branches.length ? branches : defaultConfig.branches,
    pageSettings,
  };
};

export async function migrateLegacyAppConfig(): Promise<void> {
  if (!isFirebaseReady || !auth.currentUser) throw new Error('Admin authentication is required.');

  await runTransaction(db, async (transaction) => {
    const publicSnapshot = await transaction.get(appConfigRef);
    if (publicSnapshot.exists()) return;

    const legacySnapshot = await transaction.get(legacyAppConfigRef);
    const configSource = legacySnapshot.exists() ? legacySnapshot.data() : defaultConfig;

    transaction.set(appConfigRef, normalizeAppConfig(configSource));
    if (legacySnapshot.exists()) transaction.delete(legacyAppConfigRef);
  });
}

export function subscribeAppConfig(
  callback: (config: AppConfig | null) => void,
  onError?: (error: Error) => void,
) {
  if (!isFirebaseReady) {
    callback(defaultConfig);
    return () => {};
  }

  return onSnapshot(
    appConfigRef,
    (snapshot) => {
      callback(snapshot.exists() ? normalizeAppConfig(snapshot.data()) : null);
    },
    onError,
  );
}

export function subscribeFeedbacks(
  callback: (items: Feedback[]) => void,
  branchId?: string,
  onError?: (error: Error) => void,
) {
  if (!isFirebaseReady) {
    callback([]);
    return () => {};
  }

  const q = branchId
    ? query(feedbackCollectionRef, where('branchId', '==', branchId))
    : query(feedbackCollectionRef, orderBy('date', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((item) => ({
        ...(item.data() as Feedback),
        id: item.id,
      }));
      items.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
      callback(items);
    },
    onError,
  );
}

export function subscribeAdminProfile(
  uid: string,
  callback: (profile: AdminProfile | null) => void,
  onError?: (error: Error) => void,
) {
  if (!isFirebaseReady) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    doc(adminProfilesCollectionRef, uid),
    (snapshot) => {
      const value = snapshot.data();
      if (!snapshot.exists() || (value?.role !== 'superadmin' && value?.role !== 'branch_admin')) {
        callback(null);
        return;
      }
      callback({
        role: value.role,
        ...(typeof value.branchId === 'string' ? { branchId: value.branchId } : {}),
      });
    },
    onError,
  );
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  if (!isFirebaseReady || !auth.currentUser) throw new Error('Admin authentication is required.');
  await setDoc(appConfigRef, normalizeAppConfig(config));
}

export async function setStoreAccessActive(branchId: string, active: boolean): Promise<void> {
  if (!isFirebaseReady || !auth.currentUser) throw new Error('Admin authentication is required.');
  await setDoc(doc(db, 'storeAccess', branchId), { active, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveFeedback(feedback: Omit<Feedback, 'id'>, mirrorForStore = false): Promise<string> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');

  const docRef = doc(feedbackCollectionRef);
  const date = feedback.date || new Date().toISOString();
  const createdAt = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(docRef, { ...feedback, date, createdAt });

  if (mirrorForStore) {
    batch.set(doc(db, 'storeAccess', feedback.branchId, 'reviews', docRef.id), {
      branchId: feedback.branchId,
      rating: feedback.rating,
      message: feedback.message,
      date,
      createdAt,
    });
  }

  await batch.commit();
  return docRef.id;
}

export async function updateFeedback(id: string, updates: Pick<Feedback, 'status'>): Promise<void> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');
  await updateDoc(doc(db, 'feedbacks', id), updates);
}

export async function deleteFeedbackById(id: string): Promise<void> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');
  await deleteDoc(doc(db, 'feedbacks', id));
}
