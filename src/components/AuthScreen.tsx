import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield,
  User,
  Mail,
  UserPlus,
  Lock,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { UserAccount, UserRole, ShopSettings } from '../types';
import { useToast } from './Toast';
import { generateTotpSetup, verifyTotpCode, TotpSetupResult } from '../utils/totp';
import { saveUserToFirestore, fetchLiveUsersFromFirestore } from '../utils/storage';

interface AuthScreenProps {
  existingUsers: UserAccount[];
  onAuthSuccess: (user: UserAccount, rememberMe?: boolean) => void;
  onSyncUsers?: (users: UserAccount[]) => void;
  settings: ShopSettings;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  existingUsers,
  onAuthSuccess,
  onSyncUsers,
  settings,
}) => {
  const { showToast } = useToast();

  const loginPageName = settings?.loginPageName || settings?.shopName || 'FMZ SHOP POS';
  const defaultLogo = '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_cc4a2a95.png';
  const loginPageLogo =
    (settings?.loginPageLogo && settings.loginPageLogo.trim()) ||
    (settings?.shopLogo && settings.shopLogo.trim()) ||
    (settings?.logo && settings.logo.trim()) ||
    defaultLogo;

  // Live cloud users fetched on mount for instant multi-device authentication
  const [cloudUsers, setCloudUsers] = useState<UserAccount[]>([]);

  useEffect(() => {
    let isMounted = true;
    const USERS_SYNC_TS_KEY = 'MOBILE_POS_USERS_LAST_SYNC_AT';
    let recentlySynced = false;
    try {
      const lastTs = Number(localStorage.getItem(USERS_SYNC_TS_KEY) || '0');
      if (existingUsers.length > 0 && Number.isFinite(lastTs) && Date.now() - lastTs < 30 * 60 * 1000) {
        recentlySynced = true;
      }
    } catch {
      // ignore
    }
    if (recentlySynced) {
      return () => {
        isMounted = false;
      };
    }

    setIsCheckingCloud(true);
    fetchLiveUsersFromFirestore()
      .then((live) => {
        if (isMounted) {
          setIsCheckingCloud(false);
          if (live && live.length > 0) {
            try {
              localStorage.setItem(USERS_SYNC_TS_KEY, String(Date.now()));
            } catch {
              // ignore
            }
            setCloudUsers(live);
            if (onSyncUsers) onSyncUsers(live);
          }
        }
      })
      .catch(() => {
        if (isMounted) setIsCheckingCloud(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const allUsersPool = useMemo(() => {
    const map = new Map<string, UserAccount>();
    existingUsers.forEach((u) => u && u.id && map.set(u.id, u));
    cloudUsers.forEach((u) => u && u.id && map.set(u.id, u));
    return Array.from(map.values());
  }, [existingUsers, cloudUsers]);

  const hasAdminAccount = useMemo(() => {
    return allUsersPool.some((u) => u.role === 'admin');
  }, [allUsersPool]);

  const salesmenCount = useMemo(() => {
    return allUsersPool.filter((u) => u.role === 'salesman').length;
  }, [allUsersPool]);

  // Main UI Mode: 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Register Mode States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Login Mode States
  const [activeTab, setActiveTab] = useState<UserRole>('admin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Admin TOTP 2FA Login States
  const [adminLoginStep, setAdminLoginStep] = useState<'credentials' | 'totp' | 'setup'>('credentials');
  const [pendingAdminUser, setPendingAdminUser] = useState<UserAccount | null>(null);
  const [totpInputCode, setTotpInputCode] = useState<string>('');
  const [totpSetupData, setTotpSetupData] = useState<TotpSetupResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [isGeneratingSetup, setIsGeneratingSetup] = useState<boolean>(false);

  // Forgot Password States
  const [forgotStep, setForgotStep] = useState<'email' | 'verify'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotTotpCode, setForgotTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotTargetAdmin, setForgotTargetAdmin] = useState<UserAccount | null>(null);

  // Personalized greeting name based on active role & typed email
  const greetingAccount = useMemo(() => {
    const emailNorm = loginEmail.trim().toLowerCase();
    const roleUsers = allUsersPool.filter((u) => u.role === activeTab);
    if (emailNorm) {
      const exact = roleUsers.find((u) => u.email.toLowerCase() === emailNorm);
      if (exact) return exact;
    }
    if (roleUsers.length === 1) {
      return roleUsers[0];
    }
    return null;
  }, [allUsersPool, activeTab, loginEmail]);

  // 1. Submit Admin Registration (Strictly restricted to initial system initialization)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim() || !regConfirmPassword.trim()) {
      showToast('Please fill out all fields', 'warning');
      return;
    }
    if (regPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'warning');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    const emailNormalized = regEmail.trim().toLowerCase();

    // Multi-Device Security: Check if an Admin is already registered in cloud
    setIsCheckingCloud(true);
    const liveUsers = await fetchLiveUsersFromFirestore();
    setIsCheckingCloud(false);
    const pool = liveUsers.length > 0 ? liveUsers : allUsersPool;

    if (pool.some((u) => u.role === 'admin')) {
      showToast('An Administrator is already registered. Please sign in with your password and 2FA code.', 'error');
      setMode('login');
      return;
    }

    setIsGeneratingSetup(true);
    const adminId = 'USR-ADM-' + Date.now();
    const setup = await generateTotpSetup(emailNormalized);
    setIsGeneratingSetup(false);

    const newAdmin: UserAccount = {
      id: adminId,
      name: regName.trim(),
      email: emailNormalized,
      password: regPassword,
      role: 'admin',
      storeId: adminId,
      createdAt: new Date().toISOString(),
      totpSecret: setup.secret,
      is2faEnabled: false,
    };

    saveUserToFirestore(newAdmin, adminId).catch((err) => {
      console.warn('Failed to save user to Firestore on register:', err);
    });

    setPendingAdminUser(newAdmin);
    setTotpSetupData(setup);
    setTotpInputCode('');
    setAdminLoginStep('setup');
    setMode('login');
    setActiveTab('admin');

    showToast('Administrator created! Please scan QR code to pair your Authenticator app.', 'info');
  };

  // 2. Submit Login Credentials
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast('Please enter Email and Password', 'warning');
      return;
    }

    const emailNorm = loginEmail.trim().toLowerCase();

    const findSalesmanInPool = (pool: UserAccount[]) =>
      pool.find(
        (u) =>
          u.email.toLowerCase() === emailNorm &&
          u.password === loginPassword &&
          u.role === 'salesman'
      );

    const findAdminInPool = (pool: UserAccount[]) => {
      const matchingAdmins = pool.filter(
        (u) => u.email.toLowerCase() === emailNorm && u.role === 'admin'
      );
      return (
        matchingAdmins.find((u) => (u.is2faEnabled || u.totpSecret) && u.password === loginPassword) ||
        matchingAdmins.find((u) => u.password === loginPassword)
      );
    };

    // 1. Instant local/pre-fetched pool check (0ms delay if already fetched on mount)
    let pool = allUsersPool;
    let salesmanUser = findSalesmanInPool(pool);
    let adminUser = findAdminInPool(pool);

    // Only block on Firestore fetch if user wasn't matched in already-loaded pool
    if ((activeTab === 'salesman' && !salesmanUser) || (activeTab !== 'salesman' && !adminUser)) {
      setIsCheckingCloud(true);
      const liveUsers = await fetchLiveUsersFromFirestore();
      setIsCheckingCloud(false);
      if (liveUsers.length > 0) {
        setCloudUsers(liveUsers);
        if (onSyncUsers) onSyncUsers(liveUsers);
        pool = liveUsers;
        salesmanUser = findSalesmanInPool(pool);
        adminUser = findAdminInPool(pool);
      }
    }

    // 2. Check if credentials match a Salesman account
    if (salesmanUser || activeTab === 'salesman') {
      if (salesmanUser) {
        const resolvedSalesman: UserAccount = {
          ...salesmanUser,
          storeId: salesmanUser.storeId || 'main_store',
        };
        showToast(`Welcome ${resolvedSalesman.name}!`, 'success');
        onAuthSuccess(resolvedSalesman, rememberMe);
        return;
      } else {
        showToast('Invalid Salesman Email or Password', 'error');
        return;
      }
    }

    // 3. Match admin account
    if (!adminUser) {
      showToast('Invalid Email address or Password.', 'error');
      return;
    }

    const resolvedAdmin: UserAccount = {
      ...adminUser,
      storeId: adminUser.storeId || adminUser.id,
    };

    setPendingAdminUser(resolvedAdmin);
    setTotpInputCode('');

    // 4. ZERO-EXPOSURE SECURITY GUARANTEE:
    // If 2FA has EVER been set up (is2faEnabled or totpSecret present),
    // NEVER show QR code setup. Go straight to 6-digit TOTP code input!
    if (resolvedAdmin.is2faEnabled || resolvedAdmin.totpSecret) {
      setAdminLoginStep('totp');
    } else {
      // Only reached if an admin has genuinely never paired an Authenticator app
      setIsGeneratingSetup(true);
      const setup = await generateTotpSetup(resolvedAdmin.email, resolvedAdmin.totpSecret);
      setIsGeneratingSetup(false);
      setTotpSetupData(setup);
      setAdminLoginStep('setup');
      showToast('First-time setup: Scan QR code with Google Authenticator.', 'info');
    }
  };

  // 3. Verify Admin 6-Digit Authenticator Code
  const handleVerifyAdminTotp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAdminUser || !pendingAdminUser.totpSecret) {
      showToast('Authenticator secret not found. Please log in with valid credentials.', 'error');
      setAdminLoginStep('credentials');
      return;
    }

    const cleanCode = totpInputCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6) {
      showToast('Please enter a valid 6-digit code from your Authenticator app.', 'warning');
      return;
    }

    const isValid = verifyTotpCode(
      pendingAdminUser.totpSecret,
      cleanCode,
      pendingAdminUser.alternateTotpSecrets
    );

    if (isValid) {
      const verifiedUser: UserAccount = {
        ...pendingAdminUser,
        is2faEnabled: true,
      };
      showToast(`Welcome back, ${verifiedUser.name}!`, 'success');
      onAuthSuccess(verifiedUser, rememberMe);
    } else {
      showToast('Invalid 6-digit passcode. Check Google Authenticator / Authy app.', 'error');
    }
  };

  // 4. Verify & Activate Initial 2FA Pairing
  const handleVerifyAndActivateTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAdminUser || !totpSetupData?.secret) {
      showToast('2FA setup failed to initialize.', 'error');
      return;
    }

    const cleanCode = totpInputCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6) {
      showToast('Please enter the 6-digit passcode shown in your Authenticator app.', 'warning');
      return;
    }

    const isValid = verifyTotpCode(totpSetupData.secret, cleanCode);
    if (isValid) {
      const updatedAdmin: UserAccount = {
        ...pendingAdminUser,
        totpSecret: totpSetupData.secret,
        is2faEnabled: true,
      };

      await saveUserToFirestore(updatedAdmin, updatedAdmin.storeId);
      showToast(`Welcome back, ${updatedAdmin.name}! Authenticator 2FA activated.`, 'success');
      onAuthSuccess(updatedAdmin, rememberMe);
    } else {
      showToast('Invalid 6-digit code! Make sure your app scanned the QR code correctly.', 'error');
    }
  };

  // 5. Copy Manual Setup Key
  const handleCopySetupSecret = () => {
    if (!totpSetupData?.secret) return;
    navigator.clipboard.writeText(totpSetupData.secret);
    setCopiedKey(true);
    showToast('2FA Setup Key copied to clipboard!', 'success');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // 6. Forgot Password Request
  const handleRequestForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      showToast('Please enter your Admin Email address', 'warning');
      return;
    }

    const emailNorm = forgotEmail.trim().toLowerCase();
    let adminUser = existingUsers.find(
      (u) => u.email.toLowerCase() === emailNorm && u.role === 'admin'
    );

    if (!adminUser) {
      setIsCheckingCloud(true);
      const liveUsers = await fetchLiveUsersFromFirestore();
      setIsCheckingCloud(false);
      if (liveUsers.length > 0) {
        if (onSyncUsers) onSyncUsers(liveUsers);
        adminUser = liveUsers.find(
          (u) => u.email.toLowerCase() === emailNorm && u.role === 'admin'
        );
      }
    }

    if (!adminUser) {
      showToast('No Administrator account found with this Email address', 'error');
      return;
    }

    setForgotTargetAdmin(adminUser);
    setForgotTotpCode('');
    setForgotStep('verify');

    if (adminUser.is2faEnabled && adminUser.totpSecret) {
      showToast('Enter 6-digit code from Google Authenticator to reset password.', 'info');
    } else {
      showToast('Enter your new password below.', 'info');
    }
  };

  // 7. Save New Password
  const handleSaveNewPasswordWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmNewPassword) {
      showToast('Please enter and confirm your new password', 'warning');
      return;
    }

    if (newPassword.length < 6) {
      showToast('New Password must be at least 6 characters long', 'warning');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showToast('Passwords do not match. Please verify.', 'error');
      return;
    }

    const targetAdmin = forgotTargetAdmin;
    if (!targetAdmin) {
      showToast('Administrator account not found', 'error');
      return;
    }

    if (targetAdmin.is2faEnabled && targetAdmin.totpSecret) {
      const cleanCode = forgotTotpCode.trim().replace(/\s+/g, '');
      if (cleanCode.length !== 6) {
        showToast('Please enter the 6-digit code from Google Authenticator.', 'warning');
        return;
      }

      const isValid = verifyTotpCode(targetAdmin.totpSecret, cleanCode, targetAdmin.alternateTotpSecrets);
      if (!isValid) {
        showToast('Invalid 6-digit Authenticator passcode!', 'error');
        return;
      }
    }

    const updatedAdmin: UserAccount = {
      ...targetAdmin,
      password: newPassword,
    };

    await saveUserToFirestore(updatedAdmin, updatedAdmin.storeId);
    showToast('Master Password reset successfully! Logging you in...', 'success');
    onAuthSuccess(updatedAdmin);
  };

  return (
    <div className="auth-root-container auth-liquid-backdrop h-screen h-[100dvh] max-h-[100dvh] w-full flex items-center justify-center p-0 sm:p-4 md:p-8 relative overflow-hidden font-sans text-slate-800 select-none">
      {/* Animated Morphing Pastel Liquid Blobs (Light & Airy, GPU-composited) */}
      <div
        aria-hidden="true"
        className="auth-liquid-blob-1 absolute -top-28 -left-24 w-80 h-80 sm:w-[28rem] sm:h-[28rem] pointer-events-none opacity-85"
        style={{
          background:
            'radial-gradient(circle at 35% 35%, rgba(125, 211, 252, 0.65) 0%, rgba(165, 243, 252, 0.35) 52%, transparent 75%)',
          filter: 'blur(26px)',
        }}
      />
      <div
        aria-hidden="true"
        className="auth-liquid-blob-2 absolute -bottom-32 -right-24 w-80 h-80 sm:w-[30rem] sm:h-[30rem] pointer-events-none opacity-85"
        style={{
          background:
            'radial-gradient(circle at 60% 60%, rgba(196, 181, 253, 0.55) 0%, rgba(147, 197, 253, 0.35) 54%, transparent 76%)',
          filter: 'blur(28px)',
        }}
      />
      <div
        aria-hidden="true"
        className="auth-liquid-blob-3 hidden sm:block absolute top-1/3 left-1/3 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(254, 205, 211, 0.45) 0%, rgba(153, 246, 228, 0.28) 55%, transparent 75%)',
          filter: 'blur(24px)',
        }}
      />

      {/* Main Light Frosted Fluid Liquid Glass Portal */}
      <div className="auth-card-container auth-liquid-card animate-liquid-in relative w-full h-full max-h-[100dvh] sm:h-auto sm:max-h-[92vh] max-w-md lg:max-w-5xl sm:rounded-[2.5rem] overflow-hidden z-10 flex flex-col justify-between">
        {/* ================= MOBILE-ONLY LIGHT FLUID LIQUID HERO (LOWERED LOGO POSITION) ================= */}
        <div className="auth-mobile-hero auth-liquid-hero-surface ios-liquid-sheen-layer lg:hidden pt-12 sm:pt-14 px-5 pb-8 text-slate-900 flex flex-col items-center justify-center text-center relative overflow-hidden shrink-0 z-10">
          {/* Drifting Pastel Liquid Orbs inside Mobile Hero */}
          <div
            aria-hidden="true"
            className="auth-liquid-blob-1 absolute -top-12 -right-12 w-48 h-48 pointer-events-none opacity-80"
            style={{
              background: 'radial-gradient(circle, rgba(125, 211, 252, 0.6) 0%, transparent 70%)',
            }}
          />
          <div
            aria-hidden="true"
            className="auth-liquid-blob-2 absolute -bottom-10 -left-10 w-44 h-44 pointer-events-none opacity-75"
            style={{
              background: 'radial-gradient(circle, rgba(253, 186, 116, 0.25) 0%, rgba(253, 164, 175, 0.3) 50%, transparent 72%)',
            }}
          />

          {/* Circular Store Logo suspended inside Animated Light Liquid Halo */}
          <div className="relative z-10 mt-1 mb-2.5 flex items-center justify-center">
            <div
              aria-hidden="true"
              className="auth-logo-liquid-ring absolute -inset-2.5 rounded-full opacity-90 pointer-events-none"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(56,189,248,0.7), rgba(45,212,191,0.65), rgba(251,113,133,0.5), rgba(255,255,255,0.9), rgba(56,189,248,0.7))',
                filter: 'blur(7px)',
              }}
            />
            <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full overflow-hidden shadow-[0_18px_42px_rgba(14,116,144,0.18)] flex items-center justify-center shrink-0 relative z-10 ring-4 ring-white bg-white p-2.5 sm:p-3">
              <img
                src={loginPageLogo}
                alt={loginPageName}
                className="w-full h-full object-contain select-none transition-transform duration-300 hover:scale-105"
              />
            </div>
          </div>

          {/* Store Brand Title */}
          <div className="relative z-10 space-y-1.5 mb-1">
            <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {loginPageName}
            </h2>
            <div className="h-0.5 w-16 bg-gradient-to-r from-sky-500 via-blue-600 to-rose-500 rounded-full mx-auto" />
          </div>

          {/* Dual Animated Flowing White Liquid Wave Cutout */}
          <div
            aria-hidden="true"
            className="absolute -bottom-px left-0 right-0 h-7 sm:h-9 overflow-hidden pointer-events-none z-20"
          >
            <svg
              className="auth-wave-flow-reverse absolute bottom-0 left-0 w-[200%] h-full opacity-60"
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
            >
              <path
                d="M0,46 C150,95 300,5 450,46 C600,88 750,8 900,46 C1050,84 1150,24 1200,46 L1200,120 L0,120 Z"
                fill="rgba(255,255,255,0.7)"
              />
            </svg>
            <svg
              className="auth-wave-flow absolute bottom-0 left-0 w-[200%] h-full"
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
            >
              <path
                d="M0,58 C180,10 340,102 520,54 C700,6 860,98 1040,54 C1120,34 1165,46 1200,58 L1200,120 L0,120 Z"
                fill="rgba(255,255,255,0.97)"
              />
            </svg>
          </div>

          {isCheckingCloud && (
            <div className="absolute top-3 right-3.5 flex items-center gap-1 text-[10px] font-bold text-sky-800 z-30">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Syncing...</span>
            </div>
          )}
        </div>

        {/* ================= DESKTOP & MAIN CONTENT GRID ================= */}
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden min-h-0">
          {/* ================= DESKTOP-ONLY LEFT SIDE: LIGHT FLUID LIQUID BRAND SHOWCASE ================= */}
          <div className="hidden lg:flex lg:order-1 lg:col-span-5 w-full auth-liquid-hero-surface p-8 pr-12 text-slate-900 flex-col items-center justify-center relative overflow-hidden shrink-0 lg:min-h-[560px]">
            {/* Organic Morphing Pastel Liquid Glows */}
            <div
              aria-hidden="true"
              className="auth-liquid-blob-1 absolute -top-20 -left-16 w-80 h-80 pointer-events-none opacity-85"
              style={{
                background:
                  'radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, rgba(165, 243, 252, 0.25) 55%, transparent 72%)',
              }}
            />
            <div
              aria-hidden="true"
              className="auth-liquid-blob-2 absolute -bottom-20 -right-10 w-72 h-72 pointer-events-none opacity-85"
              style={{
                background:
                  'radial-gradient(circle, rgba(253, 164, 175, 0.28) 0%, rgba(196, 181, 253, 0.25) 58%, transparent 74%)',
              }}
            />

            {/* Animated Vertical Liquid Wave Edge Seam */}
            <div
              aria-hidden="true"
              className="absolute right-[-1px] top-0 bottom-0 w-12 overflow-hidden pointer-events-none z-10"
            >
              <svg
                className="auth-wave-vertical w-full h-[200%]"
                viewBox="0 0 100 1600"
                preserveAspectRatio="none"
              >
                <path
                  d="M100,0 L58,0 C22,180 88,320 54,500 C20,680 86,840 58,1000 C26,1180 88,1320 54,1500 C38,1550 52,1580 58,1600 L100,1600 Z"
                  fill="rgba(255,255,255,0.95)"
                />
              </svg>
            </div>

            {/* Brand Medallion Suspended in Rotating Light Liquid Halo */}
            <div className="relative z-20 flex flex-col items-center justify-center text-center space-y-6 animate-liquid-in">
              <div className="relative flex items-center justify-center">
                <div
                  aria-hidden="true"
                  className="auth-logo-liquid-ring absolute -inset-3.5 rounded-full opacity-90 pointer-events-none"
                  style={{
                    background:
                      'conic-gradient(from 0deg, rgba(56,189,248,0.75), rgba(45,212,191,0.65), rgba(251,113,133,0.55), rgba(255,255,255,0.95), rgba(56,189,248,0.75))',
                    filter: 'blur(10px)',
                  }}
                />
                <div className="w-64 h-64 xl:w-72 xl:h-72 rounded-full overflow-hidden shadow-[0_22px_60px_rgba(14,116,144,0.18)] flex items-center justify-center relative z-10 ring-4 ring-white bg-white p-4 xl:p-5 transition-transform duration-300 hover:scale-105">
                  <img
                    src={loginPageLogo}
                    alt={loginPageName}
                    className="w-full h-full object-contain select-none"
                  />
                </div>
              </div>

              <div className="space-y-2 max-w-xs">
                <h2 className="font-display text-2xl xl:text-3xl font-black text-slate-900 tracking-tight">
                  {loginPageName}
                </h2>
                <div className="h-1 w-16 bg-gradient-to-r from-sky-500 via-blue-600 to-rose-500 rounded-full mx-auto" />
              </div>
            </div>
          </div>

          {/* ================= RIGHT SIDE (MOBILE BOTTOM): BRIGHT FROSTED GLASS FORM ================= */}
          <div className="lg:order-2 lg:col-span-7 px-5 py-4 sm:p-8 lg:p-10 bg-white/90 backdrop-blur-xl flex flex-col justify-between flex-1 overflow-y-auto min-h-0 z-20">
            {/* Desktop-only Cloud Sync Indicator */}
            {isCheckingCloud && (
              <div className="hidden lg:flex items-center justify-end mb-1 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking Cloud DB...</span>
                </div>
              </div>
            )}

            {/* Form Content Router */}
            <div className="flex-1 flex flex-col justify-center my-auto py-1">
              {mode === 'register' ? (
                hasAdminAccount ? (
                  <div className="text-center space-y-3 py-5 animate-liquid-in">
                    <div className="inline-flex p-3.5 bg-sky-50 text-sky-600 rounded-full ring-1 ring-sky-200/70">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900">Administrator Already Registered</h2>
                    <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                      This store terminal is protected by Google Authenticator 2FA. Please sign in with your credentials.
                    </p>
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="auth-liquid-btn min-h-[44px] px-7 py-2.5 text-white rounded-full text-xs font-bold cursor-pointer"
                    >
                      Sign In to Terminal
                    </button>
                  </div>
                ) : (
                  /* ================= ADMIN REGISTRATION FORM ================= */
                  <form onSubmit={handleRegisterSubmit} className="space-y-2.5 sm:space-y-3.5 animate-liquid-in">
                    <div className="text-center space-y-0.5 mb-1">
                      <h1 className="font-display text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        Create Admin
                      </h1>
                      <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                        Set up your Master Admin store owner account
                      </p>
                    </div>

                    <div className="space-y-2 sm:space-y-3">
                      <div className="relative flex items-center">
                        <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <input
                          type="text"
                          placeholder="Full Name"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          className="auth-liquid-input w-full min-h-[44px] pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 outline-none"
                        />
                      </div>

                      <div className="relative flex items-center">
                        <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                          <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <input
                          type="email"
                          placeholder="Admin E-mail Address"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          className="auth-liquid-input w-full min-h-[44px] pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 outline-none"
                        />
                      </div>

                      <div className="relative flex items-center">
                        <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <input
                          type="password"
                          placeholder="Master Password (Min 6 chars)"
                          required
                          minLength={6}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="auth-liquid-input w-full min-h-[44px] pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 outline-none"
                        />
                      </div>

                      <div className="relative flex items-center">
                        <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <input
                          type="password"
                          placeholder="Confirm Master Password"
                          required
                          minLength={6}
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          className="auth-liquid-input w-full min-h-[44px] pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isGeneratingSetup}
                      className="auth-liquid-btn w-full min-h-[48px] py-3 sm:py-3.5 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full flex items-center justify-center gap-2 cursor-pointer mt-1"
                    >
                      {isGeneratingSetup ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating 2FA Key...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>CREATE ADMIN ACCOUNT</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <p className="text-center text-[11px] sm:text-xs text-slate-600 font-medium pt-0.5">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-sky-600 font-bold hover:underline cursor-pointer min-h-[44px] px-1 inline-flex items-center"
                      >
                        Sign In
                      </button>
                    </p>
                  </form>
                )
              ) : mode === 'login' ? (
                /* ================= LOGIN ROUTER ================= */
                <div className="w-full space-y-3 sm:space-y-4 animate-liquid-in">
                  {/* Admin vs Salesman Light Liquid Switcher */}
                  {adminLoginStep === 'credentials' && salesmenCount > 0 && (
                    <div className="flex bg-sky-50/90 backdrop-blur-md p-1 rounded-full border border-sky-100 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setActiveTab('admin')}
                        className={`flex-1 min-h-[42px] py-1.5 text-[11px] sm:text-xs font-bold rounded-full transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'admin'
                            ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-md shadow-sky-500/25'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Administrator</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('salesman')}
                        className={`flex-1 min-h-[42px] py-1.5 text-[11px] sm:text-xs font-bold rounded-full transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'salesman'
                            ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-md shadow-sky-500/25'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Salesman ({salesmenCount})</span>
                      </button>
                    </div>
                  )}

                  {activeTab === 'admin' && adminLoginStep === 'totp' ? (
                    /* ================= ADMIN 2FA TOTP STEP ================= */
                    <div className="space-y-3 animate-liquid-in">
                      <div className="text-center space-y-1">
                        <div className="inline-flex p-2.5 bg-sky-50 text-sky-600 rounded-full ring-1 ring-sky-200/80 mb-0.5">
                          <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <h2 className="font-display text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                          Welcome Back{pendingAdminUser?.name ? `, ${pendingAdminUser.name}` : ''}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                          Enter 6-digit code from Google Authenticator for{' '}
                          <span className="font-bold text-sky-700">{pendingAdminUser?.email}</span>
                        </p>
                      </div>

                      <form onSubmit={handleVerifyAdminTotp} className="space-y-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          autoFocus
                          placeholder="000000"
                          required
                          value={totpInputCode}
                          onChange={(e) => setTotpInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="auth-liquid-input w-full text-center text-2xl sm:text-3xl tabular-nums font-black tracking-[0.4em] py-3 sm:py-3.5 rounded-2xl text-slate-900 outline-none"
                        />

                        <button
                          type="submit"
                          disabled={totpInputCode.length !== 6}
                          className={`w-full min-h-[48px] py-3 sm:py-3.5 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full transition flex items-center justify-center gap-2 ${
                            totpInputCode.length === 6
                              ? 'auth-liquid-btn cursor-pointer'
                              : 'bg-slate-300 cursor-not-allowed opacity-70'
                          }`}
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>VERIFY &amp; SIGN IN</span>
                        </button>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setAdminLoginStep('credentials')}
                            className="min-h-[44px] px-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Back to Email &amp; Password</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : activeTab === 'admin' && adminLoginStep === 'setup' ? (
                    /* ================= INITIAL 2FA QR CODE SETUP STEP ================= */
                    <div className="space-y-2.5 animate-liquid-in">
                      <div className="text-center space-y-0.5">
                        <h2 className="font-display text-base sm:text-xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-1.5">
                          <QrCode className="w-5 h-5 text-sky-600" />
                          <span>Setup Google Authenticator</span>
                        </h2>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Scan QR Code to pair account (<strong>{pendingAdminUser?.email}</strong>)
                        </p>
                      </div>

                      <div className="bg-sky-50/50 border border-sky-100 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center space-y-1.5 shadow-inner">
                        {isGeneratingSetup ? (
                          <div className="w-28 h-28 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />
                          </div>
                        ) : totpSetupData?.qrDataUrl ? (
                          <div className="p-1.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                            <img
                              src={totpSetupData.qrDataUrl}
                              alt="2FA Setup QR Code"
                              className="w-28 h-28 sm:w-32 sm:h-32 object-contain rounded-lg select-none"
                            />
                          </div>
                        ) : null}

                        <div className="w-full flex items-center justify-between gap-2 bg-white border border-sky-100 rounded-xl px-2.5 py-1">
                          <code className="text-[10px] tabular-nums font-black text-sky-900 truncate">
                            {totpSetupData?.secret}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopySetupSecret}
                            className="min-h-[34px] px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <form onSubmit={handleVerifyAndActivateTotp} className="space-y-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="Enter 6-digit code from App"
                          required
                          value={totpInputCode}
                          onChange={(e) => setTotpInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="auth-liquid-input w-full text-center text-lg tabular-nums font-black tracking-widest py-2.5 rounded-2xl text-slate-900 outline-none"
                        />

                        <button
                          type="submit"
                          disabled={totpInputCode.length !== 6}
                          className={`w-full min-h-[48px] py-3 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full transition flex items-center justify-center gap-2 ${
                            totpInputCode.length === 6
                              ? 'auth-liquid-btn cursor-pointer'
                              : 'bg-slate-300 cursor-not-allowed opacity-70'
                          }`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>VERIFY &amp; ACTIVATE 2FA</span>
                        </button>
                      </form>
                    </div>
                  ) : (
                    /* ================= STANDARD LOGIN CREDENTIALS FORM ================= */
                    <form onSubmit={handleLoginSubmit} className="space-y-3 sm:space-y-4">
                      <div className="text-center pb-1">
                        <h1 className="font-display text-xl sm:text-3xl font-black text-slate-900 tracking-tight">
                          {activeTab === 'salesman'
                            ? greetingAccount?.name
                              ? `Welcome ${greetingAccount.name}`
                              : 'Welcome'
                            : greetingAccount?.name
                            ? `Welcome Back, ${greetingAccount.name}`
                            : 'Welcome Back'}
                        </h1>
                      </div>

                      <div className="space-y-2.5 sm:space-y-3">
                        {/* E-mail Input Field */}
                        <div className="relative flex items-center">
                          <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                            <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <input
                            type="email"
                            placeholder="E-mail address"
                            required
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="auth-liquid-input w-full min-h-[46px] pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 outline-none"
                          />
                        </div>

                        {/* Password Input Field */}
                        <div className="relative flex items-center">
                          <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            required
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="auth-liquid-input w-full min-h-[46px] pl-11 sm:pl-13 pr-12 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 outline-none"
                          />
                          <button
                            type="button"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-sky-600 transition cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Options: Remember me & Forgot Password */}
                        <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold px-1 text-slate-600">
                          <label className="flex items-center gap-2 min-h-[40px] cursor-pointer hover:text-slate-900">
                            <input
                              type="checkbox"
                              checked={rememberMe}
                              onChange={(e) => setRememberMe(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                            <span>Remember me</span>
                          </label>

                          {activeTab === 'admin' && (
                            <button
                              type="button"
                              onClick={() => {
                                setMode('forgot');
                                setForgotStep('email');
                                setForgotEmail(loginEmail || '');
                              }}
                              className="min-h-[40px] px-1 text-sky-600 hover:underline font-bold cursor-pointer inline-flex items-center"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Liquid Shimmer Primary CTA */}
                      <button
                        type="submit"
                        className="auth-liquid-btn w-full min-h-[48px] py-3 sm:py-3.5 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>SIGN IN</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {/* First-time admin setup link */}
                      {!hasAdminAccount && (
                        <p className="text-center text-[11px] sm:text-xs text-slate-600 font-medium pt-0.5">
                          Don&apos;t have an account?{' '}
                          <button
                            type="button"
                            onClick={() => setMode('register')}
                            className="text-sky-600 font-bold hover:underline cursor-pointer"
                          >
                            Create Admin
                          </button>
                        </p>
                      )}
                    </form>
                  )}
                </div>
              ) : (
                /* ================= FORGOT PASSWORD MODE ================= */
                <div className="w-full space-y-3 animate-liquid-in">
                  {forgotStep === 'email' ? (
                    <form onSubmit={handleRequestForgotOtp} className="space-y-3">
                      <div className="text-center space-y-0.5">
                        <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                          Reset Password
                        </h2>
                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                          Enter your Admin Email address to verify account
                        </p>
                      </div>

                      <div className="relative flex items-center">
                        <div className="absolute left-1.5 p-2 sm:p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl shadow-xs">
                          <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <input
                          type="email"
                          placeholder="Admin E-mail Address"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="auth-liquid-input w-full min-h-[46px] pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="auth-liquid-btn w-full min-h-[48px] py-3 sm:py-3.5 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>PROCEED TO RESET</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <p className="text-center text-[11px] sm:text-xs text-slate-600 font-medium">
                        Remembered your password?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="text-sky-600 font-bold hover:underline cursor-pointer min-h-[44px] px-1 inline-flex items-center"
                        >
                          Back to Sign In
                        </button>
                      </p>
                    </form>
                  ) : (
                    <form onSubmit={handleSaveNewPasswordWithOtp} className="space-y-2.5">
                      <div className="text-center space-y-0.5">
                        <h2 className="font-display text-lg font-black text-slate-900 tracking-tight">
                          Set New Password
                        </h2>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Resetting password for <strong>{forgotEmail}</strong>
                        </p>
                      </div>

                      {forgotTargetAdmin?.is2faEnabled && (
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="6-Digit 2FA Passcode"
                          required
                          value={forgotTotpCode}
                          onChange={(e) => setForgotTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="auth-liquid-input w-full text-center text-base tabular-nums font-bold tracking-[0.4em] py-2.5 rounded-2xl text-slate-800 outline-none"
                        />
                      )}

                      <div className="space-y-2">
                        <input
                          type="password"
                          placeholder="New Password (Min 6 chars)"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="auth-liquid-input w-full min-h-[44px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold outline-none"
                        />

                        <input
                          type="password"
                          placeholder="Confirm New Password"
                          required
                          minLength={6}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="auth-liquid-input w-full min-h-[44px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="auth-liquid-btn w-full min-h-[48px] py-3 text-white rounded-full font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Lock className="w-4 h-4" />
                        <span>SAVE NEW PASSWORD</span>
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="min-h-[44px] px-3 text-xs font-bold text-slate-500 hover:text-slate-900 hover:underline cursor-pointer"
                        >
                          Back to Sign In
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Footer Attribution */}
            <div className="pt-2.5 mt-1.5 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between gap-1 text-center shrink-0">
              <span className="text-[10px] sm:text-[11px] font-black tracking-wider uppercase text-sky-600">
                HAMMAD RAZA DEVELOPMENT
              </span>
              <span className="text-[10px] sm:text-[11px] font-black tracking-wider uppercase text-slate-700">
                OWNER MAJID RAO
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
