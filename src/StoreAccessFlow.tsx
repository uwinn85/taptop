import React, { useEffect, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    deleteUser,
    inMemoryPersistence,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    type User,
} from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    where,
    writeBatch,
} from 'firebase/firestore';
import { ArrowLeft, Check, Copy, KeyRound, RefreshCw, ShieldCheck, Star, Store } from 'lucide-react';
import {
    activationAuth,
    activationDb,
    isFirebaseReady,
    storeAuth,
    storeAuthEmailForCode,
    storeDb,
    type AppConfig,
    type Branch,
    type StoreReview,
} from './firebase';

const activationAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createActivationCode(existingCodes: string[]) {
    const existing = new Set(existingCodes.map((code) => code.toUpperCase()));

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const bytes = window.crypto.getRandomValues(new Uint8Array(8));
        const value = Array.from(bytes, (byte) => activationAlphabet[byte % activationAlphabet.length]).join('');
        const code = `TP-${value.slice(0, 4)}-${value.slice(4)}`;
        if (!existing.has(code)) return code;
    }

    throw new Error('Tidak dapat membuat kode aktivasi unik. Coba lagi.');
}

function normalizeReviewUrl(value: string) {
    const input = value.trim();
    if (/^https?:\/\//i.test(input)) {
        const url = new URL(input);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('Gunakan URL Google Review atau Place ID yang valid.');
        }
        return input;
    }

    if (!/^[a-z0-9_-]{3,200}$/i.test(input)) {
        throw new Error('Masukkan URL Google Review atau Place ID yang valid.');
    }

    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(input)}`;
}

function errorCode(error: unknown) {
    return (error as { code?: string } | null)?.code ?? '';
}

function activationErrorMessage(error: unknown) {
    const code = errorCode(error);
    if (code === 'app/superadmin-required') return 'Email tersebut bukan akun superadmin yang berwenang mengaktifkan kartu.';
    if (code === 'app/already-active') return 'Akses toko ini sudah aktif. Masuk menggunakan PIN toko yang berlaku.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        return 'Email atau kata sandi admin salah.';
    }
    if (code === 'auth/email-already-in-use') return 'Kode aktivasi sudah dipakai. Buat kode baru lalu coba lagi.';
    if (code === 'auth/weak-password') return 'PIN toko minimal terdiri dari 6 angka.';
    if (code === 'auth/operation-not-allowed') return 'Aktifkan metode Email/Sandi di Firebase Authentication.';
    if (code === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Coba lagi nanti.';
    if (code === 'permission-denied') return 'Firestore menolak aktivasi. Pastikan Rules terbaru sudah dipublikasikan dan akun admin memiliki role superadmin.';
    if (error instanceof Error && !code) return error.message;
    return 'Aktivasi gagal. Periksa Firebase Authentication dan Firestore Rules, lalu coba kembali.';
}

function storeLoginErrorMessage(error: unknown) {
    const code = errorCode(error);
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        return 'PIN salah atau kartu belum diaktifkan.';
    }
    if (code === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
    if (code === 'permission-denied') return 'Akses ulasan ditolak oleh Firestore Rules. Hubungi superadmin.';
    if (code === 'app/store-access-inactive') return 'Kartu toko belum aktif atau aksesnya telah dinonaktifkan.';
    return 'Tidak dapat membuka ulasan. Periksa PIN dan koneksi internet.';
}

async function syncExistingBranchReviews(branchId: string) {
    const snapshot = await getDocs(query(collection(activationDb, 'feedbacks'), where('branchId', '==', branchId)));
    let copied = 0;

    for (let start = 0; start < snapshot.docs.length; start += 400) {
        const batch = writeBatch(activationDb);
        let batchSize = 0;

        snapshot.docs.slice(start, start + 400).forEach((item) => {
            const data = item.data();
            if (typeof data.rating !== 'number' || typeof data.message !== 'string' || typeof data.date !== 'string') return;

            batch.set(doc(activationDb, 'storeAccess', branchId, 'reviews', item.id), {
                branchId,
                rating: data.rating,
                message: data.message,
                date: data.date,
                createdAt: data.createdAt ?? serverTimestamp(),
            }, { merge: true });
            batchSize += 1;
        });

        if (batchSize > 0) {
            await batch.commit();
            copied += batchSize;
        }
    }

    return copied;
}

interface StoreActivationFlowProps {
    branch: Branch;
    appConfig: AppConfig;
    isConfigReady: boolean;
    onConfigActivated: (config: AppConfig) => void;
    onCancel: () => void;
}

export function StoreActivationFlow({ branch, appConfig, isConfigReady, onConfigActivated, onCancel }: StoreActivationFlowProps) {
    const [activationCode, setActivationCode] = useState(() => createActivationCode(appConfig.branches.map((item) => item.activationCode)));
    const [storeName, setStoreName] = useState(branch.name);
    const [placeId, setPlaceId] = useState(branch.reviewUrl);
    const [storePin, setStorePin] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activationError, setActivationError] = useState('');
    const [activationNotice, setActivationNotice] = useState('');
    const [activationComplete, setActivationComplete] = useState(false);
    const [activatedUrl, setActivatedUrl] = useState('');
    const [copiedValue, setCopiedValue] = useState<'code' | 'url' | ''>('');

    const handleCopy = async (value: string, copied: 'code' | 'url') => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedValue(copied);
            window.setTimeout(() => setCopiedValue(''), 1800);
        } catch {
            setActivationError('Tidak dapat menyalin otomatis. Salin teks yang ditampilkan secara manual.');
        }
    };

    const handleActivation = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setActivationError('');
        setActivationNotice('');

        if (!isFirebaseReady) {
            setActivationError('Firebase belum dikonfigurasi. Kartu belum dapat diaktifkan.');
            return;
        }
        if (!isConfigReady) {
            setActivationError('Data toko belum selesai dimuat dari Firebase. Muat ulang halaman lalu coba kembali.');
            return;
        }

        const normalizedStoreName = storeName.trim();
        if (!normalizedStoreName) {
            setActivationError('Masukkan nama toko.');
            return;
        }
        if (!/^\d{6,12}$/.test(storePin)) {
            setActivationError('PIN toko harus terdiri dari 6 sampai 12 angka.');
            return;
        }

        let normalizedReviewUrl = '';
        try {
            normalizedReviewUrl = normalizeReviewUrl(placeId);
        } catch (error) {
            setActivationError(error instanceof Error ? error.message : 'Place ID tidak valid.');
            return;
        }

        const targetBranch = appConfig.branches.find((item) => item.id === branch.id);
        if (!targetBranch) {
            setActivationError('Kartu toko tidak ditemukan di konfigurasi Firebase.');
            return;
        }
        if (appConfig.branches.some((item) => item.id !== branch.id && item.activationCode === activationCode)) {
            setActivationError('Kode aktivasi sudah digunakan. Buat kode baru lalu coba lagi.');
            return;
        }

        setIsSubmitting(true);
        let createdStoreUser: User | null = null;
        let storeAccessSaved = false;

        try {
            await setPersistence(activationAuth, inMemoryPersistence);
            await setPersistence(storeAuth, inMemoryPersistence);
            await Promise.all([
                signOut(activationAuth).catch(() => undefined),
                signOut(storeAuth).catch(() => undefined),
            ]);

            const adminCredential = await signInWithEmailAndPassword(
                activationAuth,
                adminEmail.trim().toLowerCase(),
                adminPassword,
            );
            const adminProfileSnapshot = await getDoc(doc(activationDb, 'adminUsers', adminCredential.user.uid));
            if (!adminProfileSnapshot.exists() || adminProfileSnapshot.data().role !== 'superadmin') {
                throw Object.assign(new Error('Superadmin access is required.'), { code: 'app/superadmin-required' });
            }

            const existingAccess = await getDoc(doc(activationDb, 'storeAccess', branch.id));
            if (existingAccess.exists() && existingAccess.data().active === true) {
                throw Object.assign(new Error('Store access is already active.'), { code: 'app/already-active' });
            }

            const storeCredential = await createUserWithEmailAndPassword(
                storeAuth,
                storeAuthEmailForCode(activationCode),
                storePin,
            );
            createdStoreUser = storeCredential.user;

            const nextConfig: AppConfig = {
                ...appConfig,
                branches: appConfig.branches.map((item) => item.id === branch.id
                    ? {
                        ...item,
                        name: normalizedStoreName,
                        reviewUrl: normalizedReviewUrl,
                        isActive: true,
                        activationCode,
                        publicAppUrl: (() => {
                            const url = new URL(window.location.href);
                            url.searchParams.set('branch', item.id);
                            return url.toString();
                        })(),
                    }
                    : item),
            };

            const batch = writeBatch(activationDb);
            batch.set(doc(activationDb, 'app', 'publicConfig'), nextConfig);
            batch.set(doc(activationDb, 'storeAccess', branch.id), {
                branchId: branch.id,
                authUid: storeCredential.user.uid,
                activationCode,
                storeName: normalizedStoreName,
                active: true,
                createdAt: existingAccess.data()?.createdAt ?? serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            await batch.commit();
            storeAccessSaved = true;
            onConfigActivated(nextConfig);

            const publicUrl = new URL(window.location.href);
            publicUrl.searchParams.set('branch', branch.id);
            setActivatedUrl(publicUrl.toString());
            setActivationComplete(true);
            setStorePin('');
            setAdminPassword('');

            try {
                const copied = await syncExistingBranchReviews(branch.id);
                setActivationNotice(`${copied} ulasan lama disiapkan untuk dibaca toko. Ulasan baru akan tersinkron otomatis.`);
            } catch {
                setActivationNotice('Kartu aktif. Ulasan baru akan tersinkron otomatis, tetapi sinkronisasi ulasan lama belum berhasil.');
            }
        } catch (error) {
            if (createdStoreUser && !storeAccessSaved) {
                await deleteUser(createdStoreUser).catch(() => undefined);
            }
            setActivationError(activationErrorMessage(error));
        } finally {
            await Promise.all([
                signOut(storeAuth).catch(() => undefined),
                signOut(activationAuth).catch(() => undefined),
            ]);
            setIsSubmitting(false);
        }
    };

    if (activationComplete) {
        return (
            <section aria-labelledby="activation-success-title" className="w-full text-left animate-in fade-in duration-300">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <Check className="h-7 w-7" aria-hidden="true" />
                </div>
                <h1 id="activation-success-title" className="text-center text-xl font-bold text-slate-900 dark:text-white">Kartu toko aktif</h1>
                <p className="mt-2 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    Toko {storeName.trim()} sudah dapat menerima masukan dan membuka ulasan menggunakan PIN.
                </p>
                <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Kode toko otomatis</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <code className="text-lg font-bold tracking-widest text-indigo-950 dark:text-indigo-100">{activationCode}</code>
                        <button type="button" onClick={() => void handleCopy(activationCode, 'code')} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300" aria-label="Salin kode toko">
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copiedValue === 'code' ? 'Tersalin' : 'Salin'}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">PIN tidak disimpan di Firestore. Berikan PIN hanya kepada pemilik toko.</p>
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Tautan halaman toko</p>
                    <div className="mt-2 flex gap-2">
                        <input readOnly value={activatedUrl} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300" aria-label="Tautan halaman toko" />
                        <button type="button" onClick={() => void handleCopy(activatedUrl, 'url')} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600" aria-label="Salin tautan halaman toko">
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copiedValue === 'url' ? 'Tersalin' : 'Salin'}
                        </button>
                    </div>
                </div>
                {activationNotice && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" role="status">{activationNotice}</p>}
                <button type="button" onClick={onCancel} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">Selesai</button>
            </section>
        );
    }

    return (
        <section aria-labelledby="activation-title" className="w-full text-left animate-in fade-in duration-300">
            <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali
            </button>
            <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    <Store className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                    <h1 id="activation-title" className="text-lg font-bold text-slate-900 dark:text-white">Aktivasi kartu toko</h1>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Verifikasi superadmin diperlukan sebelum kartu dapat digunakan.</p>
                </div>
            </div>

            <form onSubmit={handleActivation} className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                    <label htmlFor="activation-code" className="block text-xs font-semibold text-indigo-800 dark:text-indigo-300">Kode toko otomatis</label>
                    <div className="mt-2 flex items-center gap-2">
                        <input id="activation-code" readOnly value={activationCode} className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 font-mono text-sm font-bold tracking-widest text-indigo-950 dark:border-indigo-800 dark:bg-slate-950 dark:text-indigo-100" />
                        <button type="button" onClick={() => { setActivationCode(createActivationCode(appConfig.branches.map((item) => item.activationCode))); setActivationError(''); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/50">
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Buat ulang
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    <div>
                        <label htmlFor="activation-store-name" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Nama toko</label>
                        <input id="activation-store-name" required maxLength={120} value={storeName} onChange={(event) => setStoreName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Contoh: Toko Pusat" />
                    </div>
                    <div>
                        <label htmlFor="activation-place-id" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Google Review / Place ID</label>
                        <input id="activation-place-id" required maxLength={512} value={placeId} onChange={(event) => setPlaceId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Place ID atau tautan Google Review" />
                    </div>
                    <div>
                        <label htmlFor="activation-store-pin" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">PIN toko baru</label>
                        <input id="activation-store-pin" required type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={12} pattern="[0-9]{6,12}" value={storePin} onChange={(event) => setStorePin(event.target.value.replace(/\D/g, '').slice(0, 12))} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm tracking-[0.25em] text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="6–12 angka" />
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">PIN digunakan toko untuk membuka ulasan. PIN disimpan oleh Firebase Authentication, bukan di Firestore.</p>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                    <h2 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Verifikasi superadmin</h2>
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="activation-admin-email" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email admin</label>
                            <input id="activation-admin-email" required type="email" autoComplete="username" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="admin@domain.com" />
                        </div>
                        <div>
                            <label htmlFor="activation-admin-password" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Kata sandi admin</label>
                            <input id="activation-admin-password" required type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Masukkan kata sandi superadmin" />
                        </div>
                    </div>
                </div>

                {!isConfigReady && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Menunggu konfigurasi toko dari Firebase selesai dimuat.</p>}
                {activationError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{activationError}</p>}
                {activationNotice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{activationNotice}</p>}
                <button type="submit" disabled={isSubmitting || !isConfigReady || !isFirebaseReady} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {isSubmitting ? 'Memverifikasi dan mengaktifkan...' : <><KeyRound className="h-4 w-4" aria-hidden="true" /> Aktifkan kartu</>}
                </button>
            </form>
        </section>
    );
}

interface StoreReviewsAccessProps {
    branch: Branch;
    onClose: () => void;
}

export function StoreReviewsAccess({ branch, onClose }: StoreReviewsAccessProps) {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [storeName, setStoreName] = useState(branch.name);
    const [reviews, setReviews] = useState<StoreReview[] | null>(null);

    useEffect(() => () => {
        void signOut(storeAuth).catch(() => undefined);
    }, []);

    const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        if (!branch.activationCode) {
            setError('Akses PIN belum diaktifkan untuk toko ini.');
            return;
        }
        if (!/^\d{6,12}$/.test(pin)) {
            setError('Masukkan PIN toko 6 sampai 12 angka.');
            return;
        }

        setIsLoading(true);
        try {
            await setPersistence(storeAuth, inMemoryPersistence);
            await signOut(storeAuth).catch(() => undefined);
            const credential = await signInWithEmailAndPassword(storeAuth, storeAuthEmailForCode(branch.activationCode), pin);
            const accessSnapshot = await getDoc(doc(storeDb, 'storeAccess', branch.id));
            const access = accessSnapshot.data();
            if (!accessSnapshot.exists() || access?.active !== true || access?.authUid !== credential.user.uid || access?.activationCode !== branch.activationCode) {
                throw Object.assign(new Error('Store access is inactive.'), { code: 'app/store-access-inactive' });
            }

            const reviewSnapshot = await getDocs(query(
                collection(storeDb, 'storeAccess', branch.id, 'reviews'),
                orderBy('date', 'desc'),
                limit(100),
            ));
            setStoreName(typeof access.storeName === 'string' ? access.storeName : branch.name);
            setReviews(reviewSnapshot.docs.map((item) => {
                const data = item.data();
                return {
                    id: item.id,
                    branchId: branch.id,
                    rating: typeof data.rating === 'number' ? data.rating : 0,
                    message: typeof data.message === 'string' ? data.message : '',
                    date: typeof data.date === 'string' ? data.date : '',
                };
            }));
            setPin('');
        } catch (loginError) {
            await signOut(storeAuth).catch(() => undefined);
            setError(storeLoginErrorMessage(loginError));
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = async () => {
        await signOut(storeAuth).catch(() => undefined);
        setReviews(null);
        onClose();
    };

    return (
        <section aria-labelledby="store-reviews-title" className="w-full text-left animate-in fade-in duration-300">
            <button type="button" onClick={() => { void handleClose(); }} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke halaman toko
            </button>

            {reviews === null ? (
                <>
                    <div className="mb-5 flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <KeyRound className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                            <h1 id="store-reviews-title" className="text-lg font-bold text-slate-900 dark:text-white">Ulasan toko</h1>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Masukkan PIN untuk membaca ulasan {branch.name}. Akses ini hanya dapat melihat data.</p>
                        </div>
                    </div>
                    <form onSubmit={handleUnlock} className="space-y-4">
                        <div>
                            <label htmlFor="store-review-pin" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">PIN toko</label>
                            <input id="store-review-pin" required type="password" inputMode="numeric" autoComplete="current-password" minLength={6} maxLength={12} pattern="[0-9]{6,12}" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, 12)); setError(''); }} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-center text-lg tracking-[0.4em] text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="••••••" />
                        </div>
                        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                        <button type="submit" disabled={isLoading || !branch.activationCode} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                            {isLoading ? 'Memeriksa PIN...' : <><KeyRound className="h-4 w-4" aria-hidden="true" /> Lihat ulasan</>}
                        </button>
                        <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Ulasan hanya dibaca setelah PIN toko diverifikasi.</p>
                    </form>
                </>
            ) : (
                <>
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Akses baca-saja</p>
                            <h1 id="store-reviews-title" className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{storeName}</h1>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maksimal 100 ulasan terbaru</p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <Store className="h-5 w-5" aria-hidden="true" />
                        </div>
                    </div>
                    <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                        {reviews.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Belum ada ulasan tersimpan</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ulasan baru akan tampil di sini setelah dikirim pelanggan.</p>
                            </div>
                        ) : reviews.map((review) => (
                            <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-0.5" aria-label={`Rating ${review.rating} dari 5`}>
                                        {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} aria-hidden="true" />)}
                                    </div>
                                    <time className="text-[10px] text-slate-500 dark:text-slate-400">
                                        {review.date && !Number.isNaN(Date.parse(review.date)) ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(review.date)) : 'Tanggal tidak tersedia'}
                                    </time>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">{review.message}</p>
                            </article>
                        ))}
                    </div>
                    <button type="button" onClick={() => { void handleClose(); }} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">Tutup akses ulasan</button>
                </>
            )}
        </section>
    );
}
