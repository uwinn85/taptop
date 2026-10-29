import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    type User,
} from 'firebase/auth';
import {
    Star, Store, ShieldCheck, Moon, Sun,
    Settings, MapPin, Inbox, Type, KeyRound,
    LogOut, Trash2, Copy, ExternalLink,
    MessageSquare, Check, AlertTriangle, PhoneCall, Link as LinkIcon, QrCode, X, Eye, Plus
} from 'lucide-react';
import {
    auth,
    defaultConfig,
    isFirebaseReady,
    migrateLegacyAppConfig,
    saveAppConfig,
    saveFeedback,
    setStoreAccessActive,
    subscribeAdminProfile,
    subscribeAppConfig,
    subscribeFeedbacks,
    updateFeedback,
    deleteFeedbackById,
    type AdminProfile,
    type AppConfig,
    type UserRole,
} from './firebase';
import { StoreActivationFlow, StoreReviewsAccess } from './StoreAccessFlow';

// --- TIPE DATA ---
type ViewState = 'rating' | 'positive' | 'negative' | 'thanks' | 'inactive' | 'activation' | 'store_reviews';
type AppMode = 'client' | 'admin_login' | 'admin_dashboard';
type AdminTab = 'qr' | 'page' | 'security' | 'feedback';

interface Feedback {
    id: string;
    branchId: string;
    rating: number;
    message: string;
    date: string;
    status: 'new' | 'resolved';
}

interface Branch {
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

interface PageSettings {
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

const serializeAppConfig = (config: AppConfig): string => {
    const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(normalize);
        if (value !== null && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value)
                    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
                    .map(([key, nestedValue]) => [key, normalize(nestedValue)])
            );
        }
        return value;
    };

    return JSON.stringify(normalize(config)) ?? '';
};

const getLoginErrorMessage = (error: unknown): string => {
    const code = (error as { code?: string } | null)?.code;
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code ?? '')) {
        return 'Email atau kata sandi salah.';
    }
    if (code === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Coba lagi nanti.';
    if (code === 'auth/network-request-failed') return 'Koneksi gagal. Periksa internet lalu coba lagi.';
    if (code === 'auth/operation-not-allowed') return 'Aktifkan metode Email/Sandi di Firebase Authentication.';
    return 'Tidak dapat masuk. Periksa konfigurasi Firebase dan coba lagi.';
};

const getConfigPreparationErrorMessage = (error: unknown): string => {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'permission-denied') {
        return 'Firestore menolak persiapan konfigurasi (permission-denied). Publikasikan Rules terbaru; superadmin perlu akses tulis ke app/publicConfig dan akses baca/tulis ke app/config hanya untuk migrasi lama.';
    }
    if (code === 'unavailable' || code === 'deadline-exceeded') {
        return 'Firestore tidak dapat dijangkau. Periksa koneksi lalu masuk kembali.';
    }
    if (code) return `Konfigurasi Firebase gagal disiapkan (${code}). Periksa Firestore Rules.`;
    return 'Konfigurasi Firebase gagal disiapkan. Periksa Firestore Rules, lalu keluar dan masuk kembali.';
};

export default function App() {
    // --- STATE THEME ---
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setIsDarkMode(true);
        }
    }, []);

    // --- STATE APLIKASI (MODE & ROLE) ---
    const [appMode, setAppMode] = useState<AppMode>('client');
    const [adminTab, setAdminTab] = useState<AdminTab>('qr');
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(isFirebaseReady);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [passwordResetStatus, setPasswordResetStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [passwordResetMessage, setPasswordResetMessage] = useState('');
    const adminProfileUnsubscribeRef = useRef<(() => void) | null>(null);
    const adminMigrationUidRef = useRef<string | null>(null);
    const adminMigrationStatusRef = useRef<'idle' | 'pending' | 'ready'>('idle');

    // --- STATE KONFIGURASI ADMIN ---
    const [appConfig, setAppConfig] = useState<AppConfig>(defaultConfig);
    const [isConfigLoading, setIsConfigLoading] = useState(isFirebaseReady);
    const [hasLoadedConfig, setHasLoadedConfig] = useState(false);
    const [isAdminConfigReady, setIsAdminConfigReady] = useState(false);
    const [configLoadError, setConfigLoadError] = useState('');
    const [configSaveStatus, setConfigSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [configSyncError, setConfigSyncError] = useState('');
    const lastPersistedConfigRef = useRef<string | null>(null);
    const queuedConfigJsonRef = useRef<string | null>(null);
    const configWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
    const pendingConfigWritesRef = useRef(0);

    const persistAppConfig = useCallback((config: AppConfig): Promise<void> => {
        if (!isFirebaseReady || userRole !== 'superadmin' || !isAdminConfigReady) {
            return Promise.reject(new Error('Akses superadmin diperlukan untuk menyimpan pengaturan.'));
        }

        const serializedConfig = serializeAppConfig(config);
        if (serializedConfig === queuedConfigJsonRef.current) return Promise.resolve();

        queuedConfigJsonRef.current = serializedConfig;
        pendingConfigWritesRef.current += 1;
        setConfigSaveStatus('saving');
        setConfigSyncError('');

        const pendingWrite = configWriteQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                if (serializedConfig === lastPersistedConfigRef.current) return;
                await saveAppConfig(config);
                lastPersistedConfigRef.current = serializedConfig;
            })
            .then(
                () => {
                    pendingConfigWritesRef.current -= 1;
                    if (pendingConfigWritesRef.current === 0) setConfigSaveStatus('saved');
                },
                (error: unknown) => {
                    pendingConfigWritesRef.current -= 1;
                    if (queuedConfigJsonRef.current === serializedConfig) {
                        queuedConfigJsonRef.current = lastPersistedConfigRef.current;
                    }
                    if (pendingConfigWritesRef.current === 0) {
                        setConfigSaveStatus('error');
                        setConfigSyncError('Pengaturan gagal disimpan ke Firebase.');
                    }
                    throw error;
                }
            );

        configWriteQueueRef.current = pendingWrite.then(() => undefined, () => undefined);
        return pendingWrite;
    }, [userRole, isAdminConfigReady]);

    useEffect(() => {
        if (!isFirebaseReady) return;
        setIsConfigLoading(true);
        return subscribeAppConfig(
            (config) => {
                console.log('[v0] App config snapshot loaded', { exists: Boolean(config), inactiveBranchIds: JSON.stringify(config?.branches.filter((branch) => !branch.isActive).map((branch) => branch.id) ?? []) });
                const nextConfig = config ?? defaultConfig;
                const serializedConfig = config ? serializeAppConfig(config) : null;
                if (pendingConfigWritesRef.current === 0) {
                    lastPersistedConfigRef.current = serializedConfig;
                    queuedConfigJsonRef.current = serializedConfig;
                    setAppConfig(nextConfig);
                    setConfigSaveStatus(config ? 'saved' : 'idle');
                } else if (serializedConfig !== null && serializedConfig === queuedConfigJsonRef.current) {
                    lastPersistedConfigRef.current = serializedConfig;
                    setAppConfig(nextConfig);
                }
                setHasLoadedConfig(true);
                setIsConfigLoading(false);
                setConfigLoadError('');
                setConfigSyncError('');
            },
            (error) => {
                console.log('[v0] App config snapshot failed', { code: (error as { code?: string }).code });
                setIsConfigLoading(false);
                setConfigLoadError('Konfigurasi aplikasi gagal dimuat dari Firebase.');
            }
        );
    }, []);

    useEffect(() => {
        if (!isFirebaseReady || userRole !== 'superadmin' || !isAdminConfigReady || !hasLoadedConfig || isConfigLoading || configLoadError) return;
        const serializedConfig = serializeAppConfig(appConfig);
        if (serializedConfig === queuedConfigJsonRef.current) {
            if (pendingConfigWritesRef.current === 0) setConfigSaveStatus('saved');
            return;
        }

        setConfigSaveStatus('saving');
        const timeoutId = window.setTimeout(() => {
            void persistAppConfig(appConfig).catch(() => undefined);
        }, 500);
        return () => window.clearTimeout(timeoutId);
    }, [appConfig, userRole, isAdminConfigReady, hasLoadedConfig, isConfigLoading, configLoadError, persistAppConfig]);

    const [selectedBranchIndex, setSelectedBranchIndex] = useState(0);

    useEffect(() => {
        if (!isFirebaseReady) {
            setIsAuthLoading(false);
            return;
        }

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            adminProfileUnsubscribeRef.current?.();
            adminProfileUnsubscribeRef.current = null;
            adminMigrationUidRef.current = null;
            adminMigrationStatusRef.current = 'idle';
            setAuthUser(user);
            setAdminProfile(null);
            setUserRole(null);
            setIsAdminConfigReady(false);

            if (!user) {
                setIsAuthLoading(false);
                setIsAuthenticating(false);
                setLoginPassword('');
                setAppMode('client');
                setLoginError('');
                return;
            }

            setIsAuthLoading(true);
            adminProfileUnsubscribeRef.current = subscribeAdminProfile(
                user.uid,
                (profile) => {
                    if (!profile || (profile.role === 'branch_admin' && !profile.branchId)) {
                        setAdminProfile(null);
                        setUserRole(null);
                        setIsAdminConfigReady(false);
                        setIsAuthLoading(false);
                        setIsAuthenticating(false);
                        setAppMode('admin_login');
                        setLoginError('Akun ini belum memiliki profil admin yang valid di Firestore.');
                        return;
                    }

                    setAdminProfile(profile);
                    setUserRole(profile.role);
                    setAdminTab(profile.role === 'superadmin' ? 'qr' : 'feedback');
                    setLoginError('');

                    if (profile.role === 'branch_admin') {
                        setIsAdminConfigReady(false);
                        setIsAuthLoading(true);
                        return;
                    }

                    if (adminMigrationStatusRef.current === 'ready' && adminMigrationUidRef.current === user.uid) {
                        setIsAdminConfigReady(true);
                        setAppMode('admin_dashboard');
                        setIsAuthLoading(false);
                        setIsAuthenticating(false);
                        return;
                    }

                    if (adminMigrationStatusRef.current === 'pending' && adminMigrationUidRef.current === user.uid) return;

                    adminMigrationUidRef.current = user.uid;
                    adminMigrationStatusRef.current = 'pending';
                    setIsAuthLoading(true);
                    void migrateLegacyAppConfig().then(() => {
                        if (auth.currentUser?.uid !== user.uid) return;
                        adminMigrationStatusRef.current = 'ready';
                        setIsAdminConfigReady(true);
                        setAppMode('admin_dashboard');
                        setIsAuthLoading(false);
                        setIsAuthenticating(false);
                    }).catch((error: unknown) => {
                        adminMigrationUidRef.current = null;
                        adminMigrationStatusRef.current = 'idle';
                        setIsAdminConfigReady(false);
                        setIsAuthLoading(false);
                        setIsAuthenticating(false);
                        setAppMode('admin_login');
                        setLoginError(getConfigPreparationErrorMessage(error));
                    });
                },
                () => {
                    setAdminProfile(null);
                    setUserRole(null);
                    setIsAdminConfigReady(false);
                    setIsAuthLoading(false);
                    setIsAuthenticating(false);
                    setAppMode('admin_login');
                    setLoginError('Tidak dapat membaca profil admin dari Firestore.');
                }
            );
        }, (error) => {
            setIsAuthLoading(false);
            setIsAuthenticating(false);
            setLoginError(getLoginErrorMessage(error));
        });

        return () => {
            unsubscribeAuth();
            adminProfileUnsubscribeRef.current?.();
            adminProfileUnsubscribeRef.current = null;
        };
    }, []);

    const [showQrModal, setShowQrModal] = useState(false);
    
    // Modal state untuk bulk add branches
    const [showBulkAddModal, setShowBulkAddModal] = useState(false);
    const [bulkCount, setBulkCount] = useState(5);

    // Popup state untuk melihat detail feedback
    const [selectedFeedbackModal, setSelectedFeedbackModal] = useState<Feedback | null>(null);
    
    // Simulasi mendeteksi cabang aktif berdasarkan parameter URL atau default ke cabang pertama
    const [currentClientBranchId, setCurrentClientBranchId] = useState('UTAMA1');
    
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const branchParam = params.get('branch');
        if (branchParam) {
            setCurrentClientBranchId(branchParam);
        }
    }, []);

    const activeBranch = appConfig.branches[selectedBranchIndex] || appConfig.branches[0];
    const clientBranch = appConfig.branches.find((branch) => branch.id === currentClientBranchId) ?? null;

    useEffect(() => {
        if (adminProfile?.role !== 'branch_admin' || !authUser) return;
        if (!hasLoadedConfig) {
            if (configLoadError) {
                setIsAuthLoading(false);
                setAppMode('admin_login');
                setLoginError(configLoadError);
            }
            return;
        }

        const branchIndex = appConfig.branches.findIndex((branch) => branch.id === adminProfile.branchId);
        if (branchIndex === -1) {
            setIsAuthLoading(false);
            setAppMode('admin_login');
            setLoginError('Profil admin tidak terhubung ke cabang yang tersedia.');
            setUserRole(null);
            return;
        }

        setSelectedBranchIndex(branchIndex);
        setAppMode('admin_dashboard');
        setIsAuthLoading(false);
        setIsAuthenticating(false);
        setLoginError('');
    }, [adminProfile, authUser, hasLoadedConfig, configLoadError, appConfig.branches]);

    // --- STATE CLIENT (PENGUNJUNG) ---
    const [view, setView] = useState<ViewState>('rating');
    const viewRef = useRef(view);
    viewRef.current = view;
    const [hoveredRating, setHoveredRating] = useState(0);
    const [selectedRating, setSelectedRating] = useState(0);
    const [feedbackText, setFeedbackText] = useState('');
    
    // Cek status keaktifan saat client load
    useEffect(() => {
        if (viewRef.current === 'activation' || viewRef.current === 'store_reviews') return;
        if (!clientBranch || !clientBranch.isActive) {
            setView('inactive');
        } else {
            setView('rating');
        }
    }, [currentClientBranchId, clientBranch]);
    
    // --- DATA ULASAN REAL-TIME ---
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
    const [feedbackSyncError, setFeedbackSyncError] = useState('');
    const [feedbackSubmitError, setFeedbackSubmitError] = useState('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

    useEffect(() => {
        if (!isFirebaseReady || !adminProfile) {
            setFeedbacks([]);
            setSelectedFeedbackModal(null);
            setIsFeedbackLoading(false);
            setFeedbackSyncError('');
            return;
        }

        setIsFeedbackLoading(true);
        const branchId = adminProfile.role === 'branch_admin' ? adminProfile.branchId : undefined;
        return subscribeFeedbacks(
            (items) => {
                setFeedbacks(items);
                setSelectedFeedbackModal((current) => current ? items.find((item) => item.id === current.id) ?? null : null);
                setIsFeedbackLoading(false);
                setFeedbackSyncError('');
            },
            branchId,
            () => {
                setIsFeedbackLoading(false);
                setFeedbackSyncError('Data ulasan gagal dimuat dari Firebase.');
            }
        );
    }, [adminProfile]);

    const ratingDescriptions = [
        "",
        "Sangat Buruk 😞",
        "Kurang Baik 😕",
        "Biasa Saja 😐",
        "Bagus! 🙂",
        "Sangat Luar Biasa! 😍"
    ];

    const handleRatingClick = (rating: number) => {
        setSelectedRating(rating);
        if (rating >= 4) {
            setView('positive');
            triggerConfetti();
        } else {
            setView('negative');
        }
    };

    const submitFeedback = async () => {
        const message = feedbackText.trim();
        if (!clientBranch || !message || isSubmittingFeedback) return;
        if (!isFirebaseReady) {
            setFeedbackSubmitError('Firebase belum dikonfigurasi, jadi ulasan belum dapat disimpan.');
            return;
        }

        const feedbackData = {
            branchId: clientBranch.id,
            rating: selectedRating,
            message,
            date: new Date().toISOString(),
            status: 'new' as const,
        };

        setFeedbackSubmitError('');
        setIsSubmittingFeedback(true);
        try {
            const id = await saveFeedback(feedbackData, Boolean(clientBranch.activationCode && clientBranch.isActive));
            const newFeedback: Feedback = { ...feedbackData, id };
            setFeedbacks((current) => current.some((item) => item.id === id) ? current : [newFeedback, ...current]);
            setFeedbackText('');
            setView('thanks');
        } catch {
            setFeedbackSubmitError('Ulasan gagal dikirim ke Firebase. Periksa koneksi dan coba lagi.');
            setFeedbackSyncError('Ulasan gagal disimpan ke Firebase.');
        } finally {
            setIsSubmittingFeedback(false);
        }
    };

    const resetClientView = () => {
        if (!clientBranch || !clientBranch.isActive) {
            setView('inactive');
        } else {
            setView('rating');
        }
        setSelectedRating(0);
        setHoveredRating(0);
        setFeedbackSubmitError('');
    };

    const goToGoogleReview = () => {
        if (clientBranch?.reviewUrl) window.open(clientBranch.reviewUrl, '_blank', 'noopener,noreferrer');
    };

    // Fungsi animasi pesta (confetti)
    const triggerConfetti = () => {
        const runConfetti = () => {
            if ((window as any).confetti) {
                // Confetti dari sudut kiri bawah
                (window as any).confetti({
                    particleCount: 80,
                    angle: 60,
                    spread: 70,
                    origin: { x: 0, y: 1 },
                    colors: ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#3B82F6']
                });
                // Confetti dari sudut kanan bawah
                (window as any).confetti({
                    particleCount: 80,
                    angle: 120,
                    spread: 70,
                    origin: { x: 1, y: 1 },
                    colors: ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#3B82F6']
                });
            }
        };

        if ((window as any).confetti) {
            runConfetti();
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
            script.onload = runConfetti;
            document.head.appendChild(script);
        }
    };

    // --- LOGIC ADMIN ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = loginEmail.trim().toLowerCase();
        if (!isFirebaseReady) {
            setLoginError('Firebase belum dikonfigurasi. Admin tidak dapat masuk.');
            return;
        }
        if (!email || !loginPassword) {
            setLoginError('Masukkan email dan kata sandi.');
            return;
        }

        setIsAuthenticating(true);
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, email, loginPassword);
            setLoginPassword('');
        } catch (error) {
            setIsAuthenticating(false);
            setLoginError(getLoginErrorMessage(error));
        }
    };

    const addBranch = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let randomId = '';
        for (let i = 0; i < 6; i++) {
            randomId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const newBranch: Branch = {
            id: randomId,
            name: `Toko ${randomId}`,
            publicAppUrl: `https://toko-anda.com/feedback?branch=${randomId}`,
            activationCode: "",
            reviewUrl: "",
            qrColor: "#4F46E5",
            qrBgColor: "#FFFFFF",
            isActive: false,
            adminWhatsapp: "6281234567890"
        };
        setAppConfig({ ...appConfig, branches: [...appConfig.branches, newBranch] });
        setSelectedBranchIndex(appConfig.branches.length);
        setShowQrModal(true);
    };

    const handleBulkAddBranches = (e: React.FormEvent) => {
        e.preventDefault();
        const count = Number(bulkCount);
        if (isNaN(count) || count <= 0) {
            alert('Masukkan jumlah cabang yang valid!');
            return;
        }

        const newBranchesList = [...appConfig.branches];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

        for (let i = 0; i < count; i++) {
            let randomId = '';
            for (let j = 0; j < 6; j++) {
                randomId += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            while (newBranchesList.some(b => b.id === randomId)) {
                randomId = '';
                for (let j = 0; j < 6; j++) {
                    randomId += chars.charAt(Math.floor(Math.random() * chars.length));
                }
            }

            const newBranch: Branch = {
                id: randomId,
                name: `Toko ${randomId}`,
                activationCode: "",
                publicAppUrl: `https://toko-anda.com/feedback?branch=${randomId}`,
                reviewUrl: "",
                qrColor: "#4F46E5",
                qrBgColor: "#FFFFFF",
                isActive: false,
                adminWhatsapp: "6281234567890"
            };
            newBranchesList.push(newBranch);
        }

        setAppConfig({ ...appConfig, branches: newBranchesList });
        setShowBulkAddModal(false);
        alert(`Berhasil menambahkan ${count} toko baru!`);
    };

    const deleteBranch = (index: number) => {
        if (appConfig.branches.length <= 1) {
            alert('Harus ada minimal 1 cabang!');
            return;
        }
        const branchToDelete = appConfig.branches[index];
        if (branchToDelete.activationCode) {
            void setStoreAccessActive(branchToDelete.id, false).catch(() => setConfigSyncError('Akses toko gagal dinonaktifkan di Firebase.'));
        }
        const newBranches = appConfig.branches.filter((_, i) => i !== index);
        setAppConfig({ ...appConfig, branches: newBranches });
        setSelectedBranchIndex(0);
    };

    const updateBranchAtIndex = (index: number, field: keyof Branch, value: any) => {
        const newBranches = [...appConfig.branches];
        let processedValue = value;

        if (field === 'id') {
            processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        }

        if (field === 'reviewUrl' && typeof value === 'string' && value.trim() && !value.includes('http') && !value.includes('g.page')) {
            processedValue = `https://search.google.com/local/writereview?placeid=${value.trim()}`;
        }

        newBranches[index] = { ...newBranches[index], [field]: processedValue };
        setAppConfig({ ...appConfig, branches: newBranches });
        if (field === 'isActive' && newBranches[index].activationCode && typeof processedValue === 'boolean') {
            void setStoreAccessActive(newBranches[index].id, processedValue).catch(() => setConfigSyncError('Status akses PIN toko gagal diperbarui di Firebase.'));
        }
    };

    const updatePageSetting = (field: keyof PageSettings, value: string) => {
        setAppConfig({
            ...appConfig,
            pageSettings: { ...appConfig.pageSettings, [field]: value }
        });
    };

    const handlePasswordReset = async (emailAddress = authUser?.email ?? '') => {
        const email = emailAddress.trim().toLowerCase();
        if (!email) {
            setPasswordResetStatus('error');
            setPasswordResetMessage('Masukkan email untuk menerima tautan reset kata sandi.');
            return;
        }
        if (!isFirebaseReady) {
            setPasswordResetStatus('error');
            setPasswordResetMessage('Firebase belum dikonfigurasi.');
            return;
        }

        setPasswordResetStatus('sending');
        setPasswordResetMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setPasswordResetStatus('sent');
            setPasswordResetMessage('Jika email terdaftar, tautan reset kata sandi akan dikirim.');
        } catch {
            setPasswordResetStatus('error');
            setPasswordResetMessage('Email reset gagal dikirim. Periksa konfigurasi Firebase Auth.');
        }
    };

    const toggleFeedbackStatus = async (id: string) => {
        const feedback = feedbacks.find((item) => item.id === id);
        if (!feedback) return;
        if (!isFirebaseReady) {
            setFeedbackSyncError('Firebase belum dikonfigurasi. Status ulasan tidak dapat disimpan.');
            return;
        }

        const nextStatus = feedback.status === 'new' ? 'resolved' : 'new';
        setFeedbacks((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
        setSelectedFeedbackModal((current) => current?.id === id ? { ...current, status: nextStatus } : current);

        try {
            await updateFeedback(id, { status: nextStatus });
            setFeedbackSyncError('');
        } catch {
            setFeedbacks((current) => current.map((item) => item.id === id ? { ...item, status: feedback.status } : item));
            setSelectedFeedbackModal((current) => current?.id === id ? { ...current, status: feedback.status } : current);
            setFeedbackSyncError('Status ulasan gagal disimpan ke Firebase.');
        }
    };

    const deleteFeedback = async (id: string) => {
        const feedbackIndex = feedbacks.findIndex((item) => item.id === id);
        const feedback = feedbacks[feedbackIndex];
        if (!feedback) return;
        if (!isFirebaseReady) {
            setFeedbackSyncError('Firebase belum dikonfigurasi. Ulasan tidak dapat dihapus.');
            return;
        }

        setFeedbacks((current) => current.filter((item) => item.id !== id));
        setSelectedFeedbackModal((current) => current?.id === id ? null : current);

        try {
            await deleteFeedbackById(id);
            setFeedbackSyncError('');
        } catch {
            setFeedbacks((current) => {
                if (current.some((item) => item.id === id)) return current;
                const restored = [...current];
                restored.splice(Math.min(feedbackIndex, restored.length), 0, feedback);
                return restored;
            });
            setFeedbackSyncError('Ulasan gagal dihapus dari Firebase.');
        }
    };

    // --- RENDERERS ---
    const renderAdminLogin = () => (
        <div className={`w-full max-w-sm rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 text-white shadow-xl shadow-black/50 border border-slate-700' : 'bg-white/95 backdrop-blur-md text-gray-800 shadow-2xl'} animate-in zoom-in-95 duration-300`}>
            <div className="w-16 h-16 mx-auto bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2">Akses Sistem</h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-2">Masuk dengan akun administrator Firebase.</p>
            <p className="mb-6 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">Akun admin dibuat di Firebase Authentication dan aksesnya diberikan melalui dokumen adminUsers di Firestore.</p>
            <form onSubmit={handleLogin} className="space-y-4" aria-busy={isAuthenticating || isAuthLoading}>
                <div className="text-left">
                    <label htmlFor="admin-email" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Email</label>
                    <input
                        id="admin-email"
                        type="email"
                        autoComplete="username"
                        value={loginEmail}
                        onChange={(event) => { setLoginEmail(event.target.value); setLoginError(''); setPasswordResetStatus('idle'); setPasswordResetMessage(''); }}
                        placeholder="admin@domain.com"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50 outline-none focus:border-indigo-500 text-sm"
                        required
                    />
                </div>
                <div className="text-left">
                    <label htmlFor="admin-password" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Kata sandi</label>
                    <input
                        id="admin-password"
                        type="password"
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(event) => { setLoginPassword(event.target.value); setLoginError(''); }}
                        placeholder="Masukkan kata sandi"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50 outline-none focus:border-indigo-500 text-sm"
                        required
                    />
                </div>
                {loginError && <p role="alert" className="text-left text-xs text-red-600 dark:text-red-400">{loginError}</p>}
                <button type="submit" disabled={isAuthenticating || isAuthLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all text-sm sm:text-base disabled:cursor-not-allowed disabled:opacity-60">
                    {isAuthenticating || isAuthLoading ? 'Memverifikasi...' : 'Masuk'}
                </button>
                <button type="button" onClick={() => { void handlePasswordReset(loginEmail); }} disabled={passwordResetStatus === 'sending'} className="w-full py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50">
                    {passwordResetStatus === 'sending' ? 'Mengirim tautan...' : 'Lupa kata sandi?'}
                </button>
                {passwordResetMessage && <p role={passwordResetStatus === 'error' ? 'alert' : 'status'} className={`text-left text-xs ${passwordResetStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{passwordResetMessage}</p>}
            </form>
            {authUser && (
                <button type="button" onClick={() => { void signOut(auth).catch(() => setLoginError('Gagal keluar dari Firebase Auth.')); }} className="mt-3 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    Keluar dari akun ini
                </button>
            )}
            <button onClick={() => setAppMode('client')} className="mt-4 text-xs sm:text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                Batal
            </button>
        </div>
    );

    const renderAdminDashboard = () => (
        <div className={`w-full h-full min-h-screen flex flex-col p-4 sm:p-6 md:p-8 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-900'} animate-in fade-in duration-300`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b pb-4 border-gray-200 dark:border-slate-800 gap-4">
                <div className="flex items-center gap-3">
                    {userRole === 'superadmin' ? (
                        <Settings className="w-8 h-8 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    ) : (
                        <Store className="w-8 h-8 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold">
                            {userRole === 'superadmin' ? 'Admin Dashboard Utama' : `Panel Toko: ${activeBranch.name}`}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Kelola operasional dan ulasan pelanggan secara terpusat</p>
                        <p
                            role="status"
                            aria-live="polite"
                            className={`mt-1 text-xs ${!isFirebaseReady || configLoadError || configSyncError || feedbackSyncError ? 'text-amber-600 dark:text-amber-400' : configSaveStatus === 'saving' || isConfigLoading || isFeedbackLoading ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                            {!isFirebaseReady
                                ? 'Firebase belum dikonfigurasi — data dan pengaturan tidak tersinkron.'
                                : configLoadError || configSyncError || feedbackSyncError
                                    ? 'Sinkronisasi Firebase bermasalah.'
                                    : isConfigLoading || isFeedbackLoading
                                        ? 'Menghubungkan ke Firebase...'
                                        : configSaveStatus === 'saving'
                                            ? 'Menyinkronkan data dan pengaturan...'
                                            : 'Data dan pengaturan tersinkron dengan Firebase.'}
                        </p>
                        {(configLoadError || configSyncError || feedbackSyncError) && (
                            <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                                {configLoadError || configSyncError || feedbackSyncError}
                            </p>
                        )}
                        {configSaveStatus === 'error' && (
                            <button
                                type="button"
                                onClick={() => { void persistAppConfig(appConfig).catch(() => undefined); }}
                                className="mt-1 text-xs font-medium text-indigo-600 underline dark:text-indigo-400"
                            >
                                Coba simpan pengaturan lagi
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
                    {userRole === 'superadmin' && (
                        <>
                            <button onClick={() => setAdminTab('qr')} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 ${adminTab === 'qr' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'}`}>
                                <MapPin className="w-4 h-4" /> Daftar Cabang & QR
                            </button>
                            <button onClick={() => setAdminTab('feedback')} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 ${adminTab === 'feedback' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'}`}>
                                <Inbox className="w-4 h-4" /> Kotak Masuk
                            </button>
                            <button onClick={() => setAdminTab('page')} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 ${adminTab === 'page' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'}`}>
                                <Type className="w-4 h-4" /> Pengaturan Halaman
                            </button>
                        </>
                    )}
                    {userRole && (
                        <button onClick={() => setAdminTab('security')} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 ${adminTab === 'security' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'}`}>
                            <KeyRound className="w-4 h-4" /> Keamanan
                        </button>
                    )}
                    <button onClick={() => { void signOut(auth).catch(() => setConfigSyncError('Gagal keluar dari akun Firebase.')); }} className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-800/40 transition-colors font-medium text-xs sm:text-sm border border-red-200 dark:border-red-900/50">
                        <LogOut className="w-4 h-4" /> Keluar
                    </button>
                </div>
            </div>

            <div className="flex-1 w-full bg-white dark:bg-slate-800/80 rounded-3xl p-4 sm:p-6 shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
                {adminTab === 'qr' && userRole === 'superadmin' && (
                    <div className="space-y-6 overflow-y-auto pr-1">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="text-lg font-semibold flex items-center gap-2"><MapPin className="w-5 h-5 text-indigo-500" /> Manajemen Cabang & QR Code</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Kelola banyak toko dan generator pembuatan massal.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                <button type="button" onClick={() => setShowBulkAddModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl transition-colors font-semibold shadow-md flex items-center gap-1.5 shrink-0">
                                    <Plus className="w-4 h-4" /> Tambah Massal (Bulk)
                                </button>
                                <button type="button" onClick={addBranch} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl transition-colors font-semibold shadow-md flex items-center gap-1.5 shrink-0">
                                    + Tambah Satuan
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-2xl shadow-sm">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-slate-900/70 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                                        <th className="py-3 px-4">ID Cabang</th>
                                        <th className="py-3 px-4">Nama Toko / Cabang</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4">Google Review / Place ID</th>
                                        <th className="py-3 px-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                                    {appConfig.branches.map((branch, index) => (
                                        <tr key={branch.id || index} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                <input 
                                                    type="text" 
                                                    value={branch.id} 
                                                    onChange={(e) => updateBranchAtIndex(index, 'id', e.target.value)}
                                                    readOnly={Boolean(branch.activationCode)}
                                                    title={branch.activationCode ? 'ID cabang terkunci setelah aktivasi' : undefined}
                                                    className="w-28 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 font-mono text-xs uppercase read-only:opacity-70"
                                                />
                                            </td>
                                            <td className="py-3 px-4 font-medium">
                                                <input 
                                                    type="text" 
                                                    value={branch.name} 
                                                    onChange={(e) => updateBranchAtIndex(index, 'name', e.target.value)}
                                                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <button 
                                                    type="button"
                                                    onClick={() => updateBranchAtIndex(index, 'isActive', !branch.isActive)}
                                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${branch.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}
                                                >
                                                    {branch.isActive ? 'Aktif' : 'Nonaktif'}
                                                </button>
                                            </td>
                                            <td className="py-3 px-4">
                                                <input 
                                                    type="text" 
                                                    value={branch.reviewUrl} 
                                                    onChange={(e) => updateBranchAtIndex(index, 'reviewUrl', e.target.value)}
                                                    placeholder="URL atau Place ID"
                                                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
                                                />
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedBranchIndex(index);
                                                            setShowQrModal(true);
                                                        }}
                                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
                                                    >
                                                        <QrCode className="w-3.5 h-3.5" /> Detail & QR
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => deleteBranch(index)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {showBulkAddModal && (
                            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className={`w-full max-w-sm rounded-3xl p-6 ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-800'} shadow-2xl relative animate-in zoom-in-95 duration-200`}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowBulkAddModal(false)}
                                        className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 text-gray-500 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>

                                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Plus className="w-5 h-5 text-emerald-500"/> Tambah Toko Massal</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Buat banyak cabang otomatis dengan kode unik 6 digit.</p>

                                    <form onSubmit={handleBulkAddBranches} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-medium mb-1">Jumlah Toko yang Ingin Dibuat</label>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                max="100" 
                                                value={bulkCount} 
                                                onChange={(e) => setBulkCount(Number(e.target.value))}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-xs font-mono"
                                                required
                                            />
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setShowBulkAddModal(false)} 
                                                className="w-1/2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                                            >
                                                Batal
                                            </button>
                                            <button 
                                                type="submit" 
                                                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                                            >
                                                Buat Toko
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {showQrModal && (
                            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className={`w-full max-w-lg rounded-3xl p-6 md:p-8 ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-800'} shadow-2xl relative animate-in zoom-in-95 duration-200`}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowQrModal(false)}
                                        className="absolute top-6 right-6 p-2 rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 text-gray-500 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>

                                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-slate-700">
                                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                            <QrCode className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">Pengaturan Detail & QR</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Cabang: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{activeBranch.name}</span> ({activeBranch.id})</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-medium mb-1 opacity-80">Nomor WhatsApp Admin Cabang</label>
                                                <input 
                                                    type="text" 
                                                    value={activeBranch.adminWhatsapp} 
                                                    onChange={(e) => updateBranchAtIndex(selectedBranchIndex, 'adminWhatsapp', e.target.value)} 
                                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-xs outline-none focus:border-indigo-500" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium mb-1 opacity-80">URL Landing Page Publik</label>
                                                <div className="flex items-center bg-gray-50 dark:bg-slate-900 rounded-xl p-1.5 border border-gray-200 dark:border-slate-600">
                                                    <input 
                                                        type="text" 
                                                        readOnly 
                                                        value={`${window.location.origin}${window.location.pathname}?branch=${activeBranch.id}`} 
                                                        className="w-full bg-transparent outline-none text-xs text-gray-500 dark:text-gray-400 px-2 font-mono truncate"
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?branch=${activeBranch.id}`); 
                                                            alert('Tautan Landing Page Tersalin!');
                                                        }} 
                                                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg text-gray-500 transition-colors" 
                                                    >
                                                        <Copy className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="pt-2">
                                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${activeBranch.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                                                    {activeBranch.isActive ? 'Status Kartu: Aktif' : 'Status Kartu: Belum Aktif'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-inner">
                                            <img 
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?branch=${activeBranch.id}`)}&color=${activeBranch.qrColor.replace('#','')}&bgcolor=${activeBranch.qrBgColor.replace('#','')}`} 
                                                alt="QR Code" 
                                                className="w-32 h-32 rounded-lg shadow-sm mb-3 bg-white p-1"
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?branch=${activeBranch.id}`)}&color=${activeBranch.qrColor.replace('#','')}&bgcolor=${activeBranch.qrBgColor.replace('#','')}`, '_blank')} 
                                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl transition-colors text-xs font-semibold shadow-sm"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5"/> Unduh QR Resolusi Tinggi
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700 flex justify-end">
                                        <button 
                                            type="button"
                                            onClick={() => setShowQrModal(false)}
                                            className="px-5 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-xl text-xs font-semibold transition-colors"
                                        >
                                            Tutup
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {adminTab === 'feedback' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full overflow-hidden">
                        {userRole === 'superadmin' && (
                            <div className="md:col-span-1 border-r border-gray-200 dark:border-slate-700 pr-0 md:pr-4 space-y-2 overflow-y-auto">
                                <h3 className="font-semibold text-sm mb-3 opacity-70 uppercase tracking-wider">Pilih Cabang</h3>
                                {appConfig.branches.map((branch, index) => {
                                    const branchFeedbacks = feedbacks.filter(fb => fb.branchId === branch.id);
                                    const newCount = branchFeedbacks.filter(fb => fb.status === 'new').length;
                                    
                                    return (
                                        <div key={branch.id || index} onClick={() => setSelectedBranchIndex(index)} className={`p-3 rounded-xl cursor-pointer transition-all border flex justify-between items-center ${selectedBranchIndex === index ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/40 dark:border-indigo-700' : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}>
                                            <div className="overflow-hidden">
                                                <h4 className="font-medium text-sm truncate">{branch.name}</h4>
                                                <p className="text-xs text-gray-500 truncate mt-0.5">{branchFeedbacks.length} Total Ulasan</p>
                                            </div>
                                            {newCount > 0 && (
                                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{newCount}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className={userRole === 'superadmin' ? "md:col-span-3 space-y-4 overflow-y-auto" : "md:col-span-4 space-y-4 overflow-y-auto"}>
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
                                <MessageSquare className="w-5 h-5 text-indigo-500" /> Kotak Masuk Ulasan: {activeBranch.name}
                            </h3>
                            
                            {feedbackSyncError && (
                                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                                    {feedbackSyncError}
                                </p>
                            )}
                            {isFeedbackLoading ? (
                                <p role="status" className="py-10 text-center text-sm text-gray-500">Memuat ulasan tersimpan dari Firebase...</p>
                            ) : feedbacks.filter(fb => fb.branchId === activeBranch.id).length === 0 ? (
                                <div className="text-center py-16 bg-gray-50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700">
                                    <Inbox className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                                    <p className="text-gray-500 text-sm">Belum ada masukan internal untuk cabang ini.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-2xl shadow-sm">
                                    <table className="w-full text-left border-collapse min-w-[600px]">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-slate-900/70 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                                                <th className="py-3 px-4">Rating</th>
                                                <th className="py-3 px-4">Tanggal</th>
                                                <th className="py-3 px-4">Pesan Singkat</th>
                                                <th className="py-3 px-4">Status</th>
                                                <th className="py-3 px-4 text-center">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                                            {feedbacks.filter(fb => fb.branchId === activeBranch.id).map(feedback => (
                                                <tr key={feedback.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="py-3 px-4">
                                                        <div className="flex gap-0.5">
                                                            {[1, 2, 3, 4, 5].map(star => (
                                                                <Star key={star} className={`w-3.5 h-3.5 ${star <= feedback.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} />
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-xs text-gray-500">
                                                        {new Date(feedback.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}
                                                    </td>
                                                    <td className="py-3 px-4 font-medium max-w-xs truncate">
                                                        {feedback.message}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${feedback.status === 'new' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                                                            {feedback.status === 'new' ? 'Baru' : 'Selesai'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button 
                                                                type="button"
                                                                onClick={() => setSelectedFeedbackModal(feedback)}
                                                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
                                                            >
                                                                <Eye className="w-3.5 h-3.5" /> Lihat
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={() => deleteFeedback(feedback.id)}
                                                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {selectedFeedbackModal && (
                                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                    <div className={`w-full max-w-md rounded-3xl p-6 md:p-8 ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-800'} shadow-2xl relative animate-in zoom-in-95 duration-200`}>
                                        <button 
                                            type="button"
                                            onClick={() => setSelectedFeedbackModal(null)}
                                            className="absolute top-6 right-6 p-2 rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 text-gray-500 transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>

                                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-slate-700">
                                            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                                <MessageSquare className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg">Detail Ulasan</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(selectedFeedbackModal.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-xs font-medium mb-1.5 opacity-70">Rating yang Diberikan</label>
                                                <div className="flex gap-1">
                                                    {[1, 2, 3, 4, 5].map(star => (
                                                        <Star key={star} className={`w-5 h-5 ${star <= selectedFeedbackModal.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium mb-1.5 opacity-70">Isi Masukan / Komplain</label>
                                                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-sm leading-relaxed">
                                                    "{selectedFeedbackModal.message}"
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium mb-1.5 opacity-70">Status Penanganan</label>
                                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${selectedFeedbackModal.status === 'new' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                                                    {selectedFeedbackModal.status === 'new' ? 'Baru (Belum Ditindaklanjuti)' : 'Selesai (Sudah Ditangani)'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-slate-700">
                                            <button 
                                                type="button"
                                                onClick={() => toggleFeedbackStatus(selectedFeedbackModal.id)}
                                                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${selectedFeedbackModal.status === 'new' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                                            >
                                                {selectedFeedbackModal.status === 'new' ? <><Check className="w-3.5 h-3.5"/> Tandai Selesai</> : <><AlertTriangle className="w-3.5 h-3.5"/> Tandai Belum Selesai</>}
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setSelectedFeedbackModal(null)}
                                                className="px-5 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 rounded-xl text-xs font-semibold transition-colors"
                                            >
                                                Tutup
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {adminTab === 'page' && userRole === 'superadmin' && (
                    <div className="space-y-6 max-w-4xl overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4 bg-gray-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-gray-200 dark:border-slate-700">
                                <h3 className="font-semibold text-sm border-b pb-2 border-gray-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400">1. Halaman Awal (Rating Bintang)</h3>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Judul Sapaan</label>
                                    <input type="text" value={appConfig.pageSettings.title} onChange={(e) => updatePageSetting('title', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Subjudul</label>
                                    <textarea rows={2} value={appConfig.pageSettings.subtitle} onChange={(e) => updatePageSetting('subtitle', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm resize-none"/>
                                </div>
                            </div>

                            <div className="space-y-4 bg-gray-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-gray-200 dark:border-slate-700">
                                <h3 className="font-semibold text-sm border-b pb-2 border-gray-200 dark:border-slate-700 text-green-600 dark:text-green-400">2. Halaman Positif (Bintang 4-5)</h3>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Judul Perayaan</label>
                                    <input type="text" value={appConfig.pageSettings.positiveTitle} onChange={(e) => updatePageSetting('positiveTitle', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Ajakan Google Review</label>
                                    <textarea rows={2} value={appConfig.pageSettings.positiveText} onChange={(e) => updatePageSetting('positiveText', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm resize-none"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Teks Tombol Aksi</label>
                                    <input type="text" value={appConfig.pageSettings.positiveButtonText} onChange={(e) => updatePageSetting('positiveButtonText', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                            </div>

                            <div className="space-y-4 bg-gray-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-gray-200 dark:border-slate-700">
                                <h3 className="font-semibold text-sm border-b pb-2 border-gray-200 dark:border-slate-700 text-orange-600 dark:text-orange-400">3. Halaman Negatif (Bintang 1-3)</h3>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Judul Permintaan Maaf</label>
                                    <input type="text" value={appConfig.pageSettings.negativeTitle} onChange={(e) => updatePageSetting('negativeTitle', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Deskripsi Masukan</label>
                                    <textarea rows={2} value={appConfig.pageSettings.negativeText} onChange={(e) => updatePageSetting('negativeText', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm resize-none"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Placeholder Textarea</label>
                                    <input type="text" value={appConfig.pageSettings.negativePlaceholder} onChange={(e) => updatePageSetting('negativePlaceholder', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Teks Tombol Kirim</label>
                                    <input type="text" value={appConfig.pageSettings.negativeButtonText} onChange={(e) => updatePageSetting('negativeButtonText', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                            </div>

                            <div className="space-y-4 bg-gray-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-gray-200 dark:border-slate-700">
                                <h3 className="font-semibold text-sm border-b pb-2 border-gray-200 dark:border-slate-700 text-blue-600 dark:text-blue-400">4. Halaman Terima Kasih</h3>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Judul Selesai</label>
                                    <input type="text" value={appConfig.pageSettings.thanksTitle} onChange={(e) => updatePageSetting('thanksTitle', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Pesan Apresiasi</label>
                                    <textarea rows={2} value={appConfig.pageSettings.thanksText} onChange={(e) => updatePageSetting('thanksText', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm resize-none"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium opacity-80 mb-1">Teks Tombol Selesai</label>
                                    <input type="text" value={appConfig.pageSettings.thanksButtonText} onChange={(e) => updatePageSetting('thanksButtonText', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-xs sm:text-sm"/>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                    {adminTab === 'security' && userRole && adminProfile && (
                    <div className="max-w-md overflow-y-auto pr-1">
                        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><KeyRound className="w-5 h-5 text-indigo-500"/> Keamanan Akun Firebase</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            Akses admin menggunakan Firebase Authentication. Kata sandi tidak disimpan di Firestore.
                        </p>
                        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 p-4 space-y-3">
                            <div>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">Akun</span>
                                <span className="text-sm font-medium">{authUser?.email ?? 'Email tidak tersedia'}</span>
                            </div>
                            <div>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">Peran</span>
                                <span className="text-sm font-medium">{userRole === 'superadmin' ? 'Superadmin' : `Admin cabang · ${activeBranch.name}`}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void handlePasswordReset(); }}
                            disabled={passwordResetStatus === 'sending' || !authUser?.email}
                            className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {passwordResetStatus === 'sending' ? 'Mengirim email...' : 'Kirim tautan reset kata sandi'}
                        </button>
                        {passwordResetMessage && (
                            <p className={`mt-3 text-sm ${passwordResetStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} role={passwordResetStatus === 'error' ? 'alert' : 'status'}>
                                {passwordResetMessage}
                            </p>
                        )}
                        <p className="mt-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                            Akun dan peran admin dikelola melalui Firebase Authentication serta dokumen adminUsers di Firestore.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderClient = () => (
        <div className={`w-full max-w-md rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden transition-all duration-500 ${isDarkMode ? 'bg-slate-800/90 text-white shadow-xl shadow-black/50 border border-slate-700/50' : 'bg-white/95 backdrop-blur-md text-gray-800 shadow-2xl border border-white'} animate-in zoom-in-95`}>
            
            {view === 'inactive' && clientBranch && (
                <div className="animate-in fade-in duration-500 py-2">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 shadow-lg dark:bg-orange-900/40 sm:mb-6 sm:h-20 sm:w-20">
                        <AlertTriangle className="h-8 w-8 text-orange-500 dark:text-orange-400 sm:h-10 sm:w-10" aria-hidden="true" />
                    </div>
                    <h1 className="mb-2 text-xl font-bold sm:text-2xl">Kartu Belum Aktif</h1>
                    <p className="mb-6 text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:text-sm">
                        Kartu untuk toko <span className="font-semibold text-gray-700 dark:text-gray-200">{clientBranch.name}</span> belum aktif.
                    </p>

                    <div className="space-y-3">
                        <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left text-xs leading-relaxed text-orange-800 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-300">
                            Superadmin dapat mengaktifkan kartu di sini dengan mengisi data toko dan memverifikasi akun admin.
                        </p>
                        <button
                            type="button"
                            onClick={() => setView('activation')}
                            disabled={!hasLoadedConfig || Boolean(configLoadError)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-xs font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                        >
                            <KeyRound className="h-4 w-4" aria-hidden="true" /> Aktifkan kartu
                        </button>
                        <a
                            href={`https://wa.me/${clientBranch.adminWhatsapp}?text=${encodeURIComponent(`Halo Admin, saya ingin mengaktifkan kartu toko ID: ${currentClientBranchId}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-xs font-semibold text-white shadow-md transition hover:bg-emerald-700 sm:text-sm"
                        >
                            <PhoneCall className="h-4 w-4" aria-hidden="true" /> Hubungi Admin (WhatsApp)
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                void navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?branch=${encodeURIComponent(currentClientBranchId)}`);
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-2.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600 sm:text-sm"
                        >
                            <LinkIcon className="h-4 w-4" aria-hidden="true" /> Salin URL Landing Page
                        </button>
                    </div>
                </div>
            )}

            {view === 'inactive' && !clientBranch && (
                <div className="py-8">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300">
                        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-bold">Kartu tidak ditemukan</h1>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Tautan QR tidak mengarah ke toko yang terdaftar.</p>
                </div>
            )}

            {view === 'activation' && clientBranch && (
                <StoreActivationFlow
                    branch={clientBranch}
                    appConfig={appConfig}
                    isConfigReady={hasLoadedConfig && !isConfigLoading && !configLoadError}
                    onConfigActivated={setAppConfig}
                    onCancel={() => setView(clientBranch.isActive ? 'rating' : 'inactive')}
                />
            )}

            {view === 'store_reviews' && clientBranch && (
                <StoreReviewsAccess branch={clientBranch} onClose={resetClientView} />
            )}

            {view === 'rating' && clientBranch && (
                <div className="animate-in fade-in duration-500">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-lg mb-4 sm:mb-6 transition-colors">
                        <Store className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full mb-3 inline-block">
                        {clientBranch.name}
                    </span>
                    <h1 className="text-xl sm:text-2xl font-bold mb-2">{appConfig.pageSettings.title}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 sm:mb-8 text-xs sm:text-sm leading-relaxed">{appConfig.pageSettings.subtitle}</p>
                    
                    <div className="flex justify-center gap-2 sm:gap-4 mb-6">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                                key={star}
                                className={`w-8 h-8 sm:w-10 sm:h-10 cursor-pointer transition-all hover:scale-125 ${
                                    (hoveredRating || selectedRating) >= star 
                                    ? 'fill-yellow-400 text-yellow-400' 
                                    : 'text-gray-300 dark:text-gray-600'
                                }`}
                                onMouseEnter={() => setHoveredRating(star)}
                                onMouseLeave={() => setHoveredRating(0)}
                                onClick={() => handleRatingClick(star)}
                            />
                        ))}
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-indigo-600 dark:text-indigo-400 h-6">
                        {ratingDescriptions[hoveredRating || selectedRating]}
                    </p>
                    {clientBranch.activationCode && (
                        <button type="button" onClick={() => setView('store_reviews')} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300">
                            <KeyRound className="h-4 w-4" aria-hidden="true" /> Akses pemilik toko · Lihat ulasan
                        </button>
                    )}
                </div>
            )}

            {view === 'positive' && (
                <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
                    <div className="flex justify-center gap-1.5 mb-4 sm:mb-6">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                                key={star}
                                className="w-8 h-8 sm:w-10 sm:h-10 fill-yellow-400 text-yellow-400 drop-shadow-sm"
                            />
                        ))}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">{appConfig.pageSettings.positiveTitle}</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 sm:mb-8 text-xs sm:text-sm leading-relaxed">{appConfig.pageSettings.positiveText}</p>
                    
                    <button type="button" onClick={goToGoogleReview} className="w-full bg-[#4285F4] hover:bg-blue-600 text-white font-semibold py-3.5 sm:py-4 px-6 rounded-2xl shadow-lg transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 mb-3 text-sm sm:text-base">
                        <ExternalLink className="w-5 h-5" /> {appConfig.pageSettings.positiveButtonText}
                    </button>
                    <button type="button" onClick={resetClientView} className="text-xs sm:text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-2 underline decoration-dotted transition-colors">
                        Kembali
                    </button>
                </div>
            )}

            {view === 'negative' && (
                <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                        <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 text-orange-500 dark:text-orange-400" />
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold mb-2">{appConfig.pageSettings.negativeTitle}</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 text-xs sm:text-sm">{appConfig.pageSettings.negativeText}</p>
                    
                    <textarea 
                        value={feedbackText}
                        onChange={(e) => { setFeedbackText(e.target.value); setFeedbackSubmitError(''); }}
                        rows={4}
                        maxLength={4000}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-20 transition-all resize-none text-xs sm:text-sm text-gray-700 dark:text-slate-200 mb-4 bg-gray-50 dark:bg-slate-900/50" 
                        placeholder={appConfig.pageSettings.negativePlaceholder}
                    />
                    {feedbackSubmitError && (
                        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                            {feedbackSubmitError}
                        </p>
                    )}
                    
                    <button type="button" onClick={submitFeedback} disabled={isSubmittingFeedback} className="w-full bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all text-sm sm:text-base">
                        {isSubmittingFeedback ? 'Mengirim...' : appConfig.pageSettings.negativeButtonText}
                    </button>
                    <button type="button" onClick={resetClientView} className="text-xs sm:text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-4 transition-colors">
                        Batal
                    </button>
                </div>
            )}

            {view === 'thanks' && (
                <div className="animate-in zoom-in-90 fade-in duration-500">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                        <Check className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500 dark:text-blue-400" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">{appConfig.pageSettings.thanksTitle}</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm leading-relaxed mb-6">{appConfig.pageSettings.thanksText}</p>
                    <button type="button" onClick={resetClientView} className="w-full border-2 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 text-gray-700 dark:text-slate-200 font-semibold py-3 px-6 rounded-xl transition-all text-sm sm:text-base">
                        {appConfig.pageSettings.thanksButtonText}
                    </button>
                </div>
            )}

            {view !== 'inactive' && (
                <button 
                    type="button"
                    onClick={() => setAppMode('admin_login')}
                    className="absolute bottom-3 right-3 p-2 text-gray-300 hover:text-gray-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors opacity-50 hover:opacity-100"
                >
                    <ShieldCheck className="w-5 h-5" />
                </button>
            )}
        </div>
    );

    return (
        <div className={`min-h-screen w-full flex items-center justify-center transition-colors duration-500 ${appMode === 'admin_dashboard' ? 'p-0' : 'p-4'} ${isDarkMode ? 'dark bg-slate-950' : 'bg-gray-100'}`}>
            <div className={`fixed inset-0 z-0 transition-opacity duration-1000 ${isDarkMode ? 'opacity-20' : 'opacity-100'}`} 
                 style={{
                    background: 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)',
                    backgroundSize: '400% 400%',
                    animation: 'gradientBG 15s ease infinite',
                 }}
            />
            {isDarkMode && (
                 <div className="fixed inset-0 z-0 opacity-100" 
                 style={{
                    background: 'linear-gradient(-45deg, #0f172a, #1e1b4b, #064e3b, #312e81)',
                    backgroundSize: '400% 400%',
                    animation: 'gradientBG 15s ease infinite',
                 }}
            />
            )}
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes gradientBG {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
            `}} />

            <button 
                type="button"
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="fixed top-4 right-4 z-50 p-3 w-12 h-12 rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-md shadow-lg text-gray-800 dark:text-yellow-400 hover:scale-110 transition-transform flex items-center justify-center border border-white/20"
            >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className={`relative z-10 w-full flex justify-center items-center ${appMode === 'admin_dashboard' ? 'h-screen' : ''}`}>
                {appMode === 'client' && renderClient()}
                {appMode === 'admin_login' && renderAdminLogin()}
                {appMode === 'admin_dashboard' && renderAdminDashboard()}
            </div>
        </div>
    );
}
