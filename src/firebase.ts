import { initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export type ViewState = 'rating' | 'positive' | 'negative' | 'thanks' | 'inactive';
export type AppMode = 'client' | 'admin_login' | 'admin_dashboard';
export type AdminTab = 'qr' | 'page' | 'security' | 'feedback';
export type UserRole = 'superadmin' | 'branch_admin';

export interface Feedback {
  id: string;
  branchId: string;
  rating: number;
  message: string;
  date: string;
  status: 'new' | 'resolved';
}

export interface Branch {
  id: string;
  name: string;
  publicAppUrl: string;
  reviewUrl: string;
  qrColor: string;
  qrBgColor: string;
  pin: string;
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
  adminPin: string;
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
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const defaultConfig: AppConfig = {
  adminPin: '1234',
  branches: [
    {
      id: 'UTAMA1',
      name: 'Cabang Utama (Pusat)',
      publicAppUrl: 'https://toko-anda.com/feedback?branch=UTAMA1',
      reviewUrl: 'https://g.page/r/example/review',
      qrColor: '#4F46E5',
      qrBgColor: '#FFFFFF',
      pin: '1111',
      isActive: true,
      adminWhatsapp: '6281234567890',
    },
    {
      id: 'CABANG2',
      name: 'Cabang Baru (Belum Aktif)',
      publicAppUrl: 'https://toko-anda.com/feedback?branch=CABANG2',
      reviewUrl: '',
      qrColor: '#4F46E5',
      qrBgColor: '#FFFFFF',
      pin: '2222',
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

export const defaultFeedbacks: Feedback[] = [
  {
    id: 'fb-1',
    branchId: 'UTAMA1',
    rating: 5,
    message: 'Pelayanan sangat ramah dan tempatnya bersih sekali!',
    date: new Date(Date.now() - 86400000).toISOString(),
    status: 'resolved',
  },
  {
    id: 'fb-2',
    branchId: 'UTAMA1',
    rating: 2,
    message: 'Parkiran terlalu sempit dan antrian cukup lama.',
    date: new Date().toISOString(),
    status: 'new',
  },
];

export const appConfigRef = doc(db, 'app', 'config');
export const feedbackCollectionRef = collection(db, 'feedbacks');

export async function ensureDefaultData(): Promise<void> {
  const snapshot = await getDoc(appConfigRef);
  if (!snapshot.exists()) {
    await setDoc(appConfigRef, defaultConfig);
  }
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
      callback(snapshot.exists() ? (snapshot.data() as AppConfig) : null);
    },
    onError,
  );
}

export function subscribeFeedbacks(
  callback: (items: Feedback[]) => void,
  onError?: (error: Error) => void,
) {
  if (!isFirebaseReady) {
    callback(defaultFeedbacks);
    return () => {};
  }

  const q = query(feedbackCollectionRef, orderBy('date', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        ...(doc.data() as Feedback),
        id: doc.id,
      }));
      callback(items);
    },
    onError,
  );
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');
  await setDoc(appConfigRef, config);
}

export async function saveFeedback(feedback: Omit<Feedback, 'id'>): Promise<string> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');

  const docRef = doc(feedbackCollectionRef);
  await setDoc(docRef, {
    ...feedback,
    date: feedback.date || new Date().toISOString(),
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateFeedback(id: string, updates: Partial<Feedback>): Promise<void> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');
  await updateDoc(doc(db, 'feedbacks', id), updates);
}

export async function deleteFeedbackById(id: string): Promise<void> {
  if (!isFirebaseReady) throw new Error('Firebase is not configured.');
  await deleteDoc(doc(db, 'feedbacks', id));
}
