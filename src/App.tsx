import React, { useState, useEffect } from 'react';
import { 
    Star, Store, ShieldCheck, Moon, Sun, 
    Settings, MapPin, Inbox, Type, KeyRound, 
    LogOut, Trash2, Copy, ExternalLink, 
    MessageSquare, Check, AlertTriangle, PhoneCall, Link as LinkIcon, QrCode, X, Eye, Plus
} from 'lucide-react';

// --- TIPE DATA ---
type ViewState = 'rating' | 'positive' | 'negative' | 'thanks' | 'inactive';
type AppMode = 'client' | 'admin_login' | 'admin_dashboard';
type AdminTab = 'qr' | 'page' | 'security' | 'feedback';
type UserRole = 'superadmin' | 'branch_admin';

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
    publicAppUrl: string;
    reviewUrl: string;
    qrColor: string;
    qrBgColor: string;
    pin: string;
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
    const [adminPinInput, setAdminPinInput] = useState('');
    const [adminTab, setAdminTab] = useState<AdminTab>('qr');
    const [userRole, setUserRole] = useState<UserRole | null>(null);

    // --- STATE KONFIGURASI ADMIN ---
    const [appConfig, setAppConfig] = useState({
        adminPin: '1234',
        branches: [
            {
                id: 'UTAMA1',
                name: 'Cabang Utama (Pusat)',
                publicAppUrl: "https://toko-anda.com/feedback?branch=UTAMA1",
                reviewUrl: "https://g.page/r/example/review",
                qrColor: "#4F46E5",
                qrBgColor: "#FFFFFF",
                pin: '1111',
                isActive: true,
                adminWhatsapp: "6281234567890"
            },
            {
                id: 'CABANG2',
                name: 'Cabang Baru (Belum Aktif)',
                publicAppUrl: "https://toko-anda.com/feedback?branch=CABANG2",
                reviewUrl: "",
                qrColor: "#4F46E5",
                qrBgColor: "#FFFFFF",
                pin: '2222',
                isActive: false,
                adminWhatsapp: "6281234567890"
            }
        ] as Branch[],
        pageSettings: {
            title: "Halo! 👋",
            subtitle: "Cerita luar biasa Anda adalah penyambung nyawa bisnis kami. Berikan 5 bintang terbaik anda",
            positiveTitle: "Kami Senang Anda Puas! 🎉",
            positiveText: "Selangkah lagi untuk Sempurnakan momen luar biasa anda hari ini, untuk menginspirasi dunia di Google",
            positiveButtonText: "Beri Ulasan di Google",
            negativeTitle: "Mohon Maaf Atas Ketidaknyamanan Ini",
            negativeText: "Bantu kami menjadi lebih baik. Ceritakan apa yang kurang memuaskan dari layanan kami.",
            negativePlaceholder: "Ketik masukan Anda di sini...",
            negativeButtonText: "Kirim Masukan",
            thanksTitle: "Terima Kasih!",
            thanksText: "Masukan Anda telah kami terima dan akan langsung diteruskan ke tim manajemen kami.",
            thanksButtonText: "Selesai"
        } as PageSettings
    });

    const [selectedBranchIndex, setSelectedBranchIndex] = useState(0);
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
    const clientBranch = appConfig.branches.find(b => b.id === currentClientBranchId) || appConfig.branches[0];

    // --- STATE CLIENT (PENGUNJUNG) ---
    const [view, setView] = useState<ViewState>('rating');
    const [hoveredRating, setHoveredRating] = useState(0);
    const [selectedRating, setSelectedRating] = useState(0);
    const [feedbackText, setFeedbackText] = useState('');
    
    // Modal state untuk aktivasi kartu di sisi client
    const [showActivationModal, setShowActivationModal] = useState(false);
    const [activationPin, setActivationPin] = useState('');

    // Cek status keaktifan saat client load
    useEffect(() => {
        if (!clientBranch || !clientBranch.isActive) {
            setView('inactive');
        } else {
            setView('rating');
        }
    }, [currentClientBranchId, clientBranch]);
    
    // --- STATE DUMMY DATA FEEDBACK ---
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([
        {
            id: 'fb-1',
            branchId: 'UTAMA1',
            rating: 5,
            message: 'Pelayanan sangat ramah dan tempatnya bersih sekali!',
            date: new Date(Date.now() - 86400000).toISOString(),
            status: 'resolved'
        },
        {
            id: 'fb-2',
            branchId: 'UTAMA1',
            rating: 2,
            message: 'Parkiran terlalu sempit dan antrian cukup lama.',
            date: new Date().toISOString(),
            status: 'new'
        }
    ]);

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

    const submitFeedback = () => {
        if (!feedbackText.trim()) return;
        
        const newFeedback: Feedback = {
            id: `fb-${Date.now()}`,
            branchId: clientBranch.id,
            rating: selectedRating,
            message: feedbackText,
            date: new Date().toISOString(),
            status: 'new'
        };
        
        setFeedbacks([newFeedback, ...feedbacks]);
        setView('thanks');
    };

    const resetClientView = () => {
        if (!clientBranch || !clientBranch.isActive) {
            setView('inactive');
        } else {
            setView('rating');
        }
        setSelectedRating(0);
        setHoveredRating(0);
    };

    const goToGoogleReview = () => {
        window.open(clientBranch.reviewUrl, '_blank');
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

    const handleClientActivation = (e: React.FormEvent) => {
        e.preventDefault();
        if (activationPin === appConfig.adminPin || activationPin === clientBranch.pin) {
            const updatedBranches = appConfig.branches.map(b => {
                if (b.id === clientBranch.id) {
                    return { ...b, isActive: true };
                }
                return b;
            });
            setAppConfig({ ...appConfig, branches: updatedBranches });
            setShowActivationModal(false);
            setActivationPin('');
            setView('rating');
        } else {
            alert('PIN Aktivasi Salah!');
        }
    };

    // --- LOGIC ADMIN ---
    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (adminPinInput === appConfig.adminPin) { 
            setUserRole('superadmin');
            setAppMode('admin_dashboard');
            setAdminTab('qr');
            setAdminPinInput('');
        } else {
            const branchMatchIndex = appConfig.branches.findIndex(b => b.pin === adminPinInput && b.pin !== '');
            if (branchMatchIndex !== -1) {
                setUserRole('branch_admin');
                setSelectedBranchIndex(branchMatchIndex);
                setAppMode('admin_dashboard');
                setAdminTab('feedback'); 
                setAdminPinInput('');
            } else {
                alert('PIN Salah! Gunakan 1234 untuk Superadmin, atau PIN Toko yang terdaftar.');
            }
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
            reviewUrl: "",
            qrColor: "#4F46E5",
            qrBgColor: "#FFFFFF",
            pin: Math.floor(1000 + Math.random() * 9000).toString(),
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
                publicAppUrl: `https://toko-anda.com/feedback?branch=${randomId}`,
                reviewUrl: "",
                qrColor: "#4F46E5",
                qrBgColor: "#FFFFFF",
                pin: Math.floor(1000 + Math.random() * 9000).toString(),
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
    };

    const updatePageSetting = (field: keyof PageSettings, value: string) => {
        setAppConfig({
            ...appConfig,
            pageSettings: { ...appConfig.pageSettings, [field]: value }
        });
    };

    const toggleFeedbackStatus = (id: string) => {
        setFeedbacks(feedbacks.map(fb => fb.id === id ? { ...fb, status: fb.status === 'new' ? 'resolved' : 'new' } : fb));
        if (selectedFeedbackModal && selectedFeedbackModal.id === id) {
            setSelectedFeedbackModal(prev => prev ? { ...prev, status: prev.status === 'new' ? 'resolved' : 'new' } : null);
        }
    };

    const deleteFeedback = (id: string) => {
        setFeedbacks(feedbacks.filter(fb => fb.id !== id));
        if (selectedFeedbackModal && selectedFeedbackModal.id === id) {
            setSelectedFeedbackModal(null);
        }
    };

    // --- RENDERERS ---
    const renderAdminLogin = () => (
        <div className={`w-full max-w-sm rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 text-white shadow-xl shadow-black/50 border border-slate-700' : 'bg-white/95 backdrop-blur-md text-gray-800 shadow-2xl'} animate-in zoom-in-95 duration-300`}>
            <div className="w-16 h-16 mx-auto bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2">Akses Sistem</h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-6">Masukkan PIN Admin atau PIN Cabang</p>
            <form onSubmit={handleLogin} className="space-y-4">
                <input 
                    type="password" 
                    value={adminPinInput}
                    onChange={(e) => setAdminPinInput(e.target.value)}
                    placeholder="Masukkan PIN..."
                    className="w-full text-center tracking-widest text-base sm:text-lg px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50 outline-none focus:border-indigo-500"
                    autoFocus
                />
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all text-sm sm:text-base">
                    Masuk
                </button>
            </form>
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
                            <button onClick={() => setAdminTab('security')} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 ${adminTab === 'security' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'}`}>
                                <KeyRound className="w-4 h-4" /> Keamanan
                            </button>
                        </>
                    )}
                    <button onClick={() => { setAppMode('client'); setUserRole(null); }} className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-800/40 transition-colors font-medium text-xs sm:text-sm border border-red-200 dark:border-red-900/50">
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
                                        <th className="py-3 px-4">PIN Toko</th>
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
                                                    className="w-28 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 font-mono text-xs uppercase"
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
                                            <td className="py-3 px-4 font-mono">
                                                <input 
                                                    type="text" 
                                                    value={branch.pin} 
                                                    onChange={(e) => updateBranchAtIndex(index, 'pin', e.target.value)}
                                                    className="w-20 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 text-center font-mono text-xs"
                                                />
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
                            
                            {feedbacks.filter(fb => fb.branchId === activeBranch.id).length === 0 ? (
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

                {adminTab === 'security' && userRole === 'superadmin' && (
                    <div className="max-w-md overflow-y-auto pr-1">
                        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><KeyRound className="w-5 h-5 text-indigo-500"/> Ubah PIN Superadmin</h3>
                        <div className="bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 p-4 rounded-xl mb-4 text-xs sm:text-sm border border-orange-200 dark:border-orange-900/50">
                            PIN ini digunakan untuk mengakses semua pengaturan aplikasi ini.
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 opacity-80">PIN Superadmin Baru</label>
                            <input type="text" value={appConfig.adminPin} onChange={(e) => setAppConfig({...appConfig, adminPin: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50 outline-none focus:border-indigo-500 text-sm font-mono tracking-widest"/>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderClient = () => (
        <div className={`w-full max-w-md rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden transition-all duration-500 ${isDarkMode ? 'bg-slate-800/90 text-white shadow-xl shadow-black/50 border border-slate-700/50' : 'bg-white/95 backdrop-blur-md text-gray-800 shadow-2xl border border-white'} animate-in zoom-in-95`}>
            
            {view === 'inactive' && (
                <div className="animate-in fade-in duration-500 py-2">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center shadow-lg mb-4 sm:mb-6">
                        <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-orange-500 dark:text-orange-400" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold mb-2">Kartu Belum Aktif</h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 text-xs sm:text-sm leading-relaxed">
                        QR Code untuk toko <span className="font-semibold text-gray-700 dark:text-gray-200">{clientBranch ? clientBranch.name : currentClientBranchId}</span> belum diaktifkan.
                    </p>

                    <div className="space-y-3">
                        <button 
                            type="button"
                            onClick={() => setShowActivationModal(true)}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm"
                        >
                            <KeyRound className="w-4 h-4" /> Aktifkan Kartu Ini
                        </button>

                        <a 
                            href={`https://wa.me/${clientBranch ? clientBranch.adminWhatsapp : '6281234567890'}?text=Halo%20Admin,%20saya%20ingin%20mengaktifkan%20kartu%20QR%20untuk%20toko%20ID:%20${currentClientBranchId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm"
                        >
                            <PhoneCall className="w-4 h-4" /> Hubungi Admin (WhatsApp)
                        </a>

                        <button 
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?branch=${currentClientBranchId}`);
                                alert('URL Landing Page berhasil disalin!');
                            }}
                            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-medium py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-xs sm:text-sm"
                        >
                            <LinkIcon className="w-4 h-4" /> Salin URL Landing Page
                        </button>
                    </div>

                    {showActivationModal && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className={`w-full max-w-sm rounded-2xl p-6 ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800'} shadow-2xl`}>
                                <h3 className="font-bold text-lg mb-2">Aktivasi Kartu QR</h3>
                                <p className="text-xs text-gray-500 mb-4">Masukkan PIN Admin atau PIN Toko untuk mengaktifkan kartu ini secara instan.</p>
                                <form onSubmit={handleClientActivation} className="space-y-4">
                                    <input 
                                        type="password" 
                                        value={activationPin}
                                        onChange={(e) => setActivationPin(e.target.value)}
                                        placeholder="Masukkan PIN..."
                                        className="w-full text-center tracking-widest px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50 outline-none focus:border-indigo-500 text-sm"
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setShowActivationModal(false)} className="w-1/2 bg-gray-200 dark:bg-slate-700 py-2.5 rounded-xl text-sm font-medium">Batal</button>
                                        <button type="submit" className="w-1/2 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium">Konfirmasi</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
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
                        onChange={(e) => setFeedbackText(e.target.value)}
                        rows={4} 
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-20 transition-all resize-none text-xs sm:text-sm text-gray-700 dark:text-slate-200 mb-4 bg-gray-50 dark:bg-slate-900/50" 
                        placeholder={appConfig.pageSettings.negativePlaceholder}
                    />
                    
                    <button type="button" onClick={submitFeedback} className="w-full bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all text-sm sm:text-base">
                        {appConfig.pageSettings.negativeButtonText}
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