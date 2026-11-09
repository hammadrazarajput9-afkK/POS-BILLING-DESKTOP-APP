import React, { useState, useMemo } from 'react';
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
  onAuthSuccess: (user: UserAccount) => void;
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

  const salesmenCount = useMemo(() => {
    return existingUsers.filter((u) => u.role === 'salesman').length;
  }, [existingUsers]);

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

  // 1. Submit Admin Registration
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
    if (existingUsers.some((u) => u.email.toLowerCase() === emailNormalized)) {
      showToast('An account with this Email address already exists', 'error');
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

    if (activeTab === 'salesman') {
      let user = existingUsers.find(
        (u) =>
          u.email.toLowerCase() === emailNorm &&
          u.password === loginPassword &&
          u.role === 'salesman'
      );

      if (!user) {
        setIsCheckingCloud(true);
        const liveUsers = await fetchLiveUsersFromFirestore();
        setIsCheckingCloud(false);
        if (liveUsers.length > 0) {
          if (onSyncUsers) onSyncUsers(liveUsers);
          user = liveUsers.find(
            (u) =>
              u.email.toLowerCase() === emailNorm &&
              u.password === loginPassword &&
              u.role === 'salesman'
          );
        }
      }

      if (!user) {
        showToast('Invalid Salesman Email or Password', 'error');
        return;
      }

      const resolvedSalesman: UserAccount = {
        ...user,
        storeId: user.storeId || 'main_store',
      };

      showToast(`Welcome back, ${resolvedSalesman.name}!`, 'success');
      onAuthSuccess(resolvedSalesman);
    } else {
      let adminUser = existingUsers.find(
        (u) =>
          u.email.toLowerCase() === emailNorm &&
          u.password === loginPassword &&
          u.role === 'admin'
      );

      if (!adminUser) {
        setIsCheckingCloud(true);
        const liveUsers = await fetchLiveUsersFromFirestore();
        setIsCheckingCloud(false);
        if (liveUsers.length > 0) {
          if (onSyncUsers) onSyncUsers(liveUsers);
          adminUser = liveUsers.find(
            (u) =>
              u.email.toLowerCase() === emailNorm &&
              u.password === loginPassword &&
              u.role === 'admin'
          );
        }
      }

      if (!adminUser) {
        showToast(
          'Invalid Administrator Email or Password. Switch to Create Admin if you need a new account.',
          'error'
        );
        return;
      }

      const resolvedAdmin: UserAccount = {
        ...adminUser,
        storeId: adminUser.storeId || adminUser.id,
      };

      setPendingAdminUser(resolvedAdmin);
      setTotpInputCode('');

      if (resolvedAdmin.is2faEnabled && resolvedAdmin.totpSecret) {
        setAdminLoginStep('totp');
        showToast('Please enter the 6-digit code from your Authenticator app.', 'info');
      } else {
        setIsGeneratingSetup(true);
        const setup = await generateTotpSetup(resolvedAdmin.email, resolvedAdmin.totpSecret);
        setIsGeneratingSetup(false);
        setTotpSetupData(setup);
        setAdminLoginStep('setup');
        showToast('First-time login: Please setup Google Authenticator 2FA.', 'info');
      }
    }
  };

  // 3. Verify Admin 6-Digit Authenticator Code
  const handleVerifyAdminTotp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAdminUser || !pendingAdminUser.totpSecret) {
      showToast('Authenticator secret not found. Please setup 2FA.', 'error');
      setAdminLoginStep('credentials');
      return;
    }

    const cleanCode = totpInputCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6) {
      showToast('Please enter a valid 6-digit code from your Authenticator app.', 'warning');
      return;
    }

    const isValid = verifyTotpCode(pendingAdminUser.totpSecret, cleanCode);
    if (isValid) {
      showToast(`2FA Verified! Welcome back, Administrator ${pendingAdminUser.name}!`, 'success');
      onAuthSuccess(pendingAdminUser);
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
      showToast('Authenticator 2FA successfully configured & locked in!', 'success');
      onAuthSuccess(updatedAdmin);
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

      const isValid = verifyTotpCode(targetAdmin.totpSecret, cleanCode);
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
    <div className="h-screen h-[100dvh] max-h-[100dvh] w-full flex items-center justify-center bg-gradient-to-br from-[#7e22ce] via-[#6366f1] to-[#4c1d95] p-0 sm:p-4 md:p-8 relative overflow-hidden font-sans text-slate-800 select-none">
      
      {/* Background Decorative Blur Blobs */}
      <div className="hidden sm:block absolute -top-24 -left-24 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="hidden sm:block absolute -bottom-28 -right-28 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphic Card - Strictly 100% Height Non-Scrollable on Mobile */}
      <div className="relative w-full h-full max-h-[100dvh] sm:h-auto sm:max-h-[92vh] max-w-md lg:max-w-5xl bg-white sm:rounded-[2.5rem] shadow-[0_25px_80px_rgba(0,0,0,0.3)] border-0 sm:border sm:border-white/30 overflow-hidden z-10 flex flex-col justify-between">
        
        {/* ================= MOBILE-ONLY PROMINENT HERO HEADER WITH LARGE LOGO & STORE NAME ================= */}
        <div className="lg:hidden pt-4 px-4 pb-6 bg-gradient-to-br from-[#7e22ce] via-[#6366f1] to-[#4c1d95] text-white flex flex-col items-center justify-center text-center relative overflow-hidden shrink-0 shadow-lg z-10">
          {/* Background Glow Blobs */}
          <div className="absolute top-[-30%] right-[-20%] w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-purple-400/20 rounded-full blur-xl pointer-events-none" />

          {/* Extra Large White Circle Badge Container on Mobile */}
          <div className="w-36 h-36 sm:w-44 sm:h-44 bg-white rounded-full p-3.5 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)] border-4 border-white/50 flex items-center justify-center shrink-0 mb-2.5 relative z-10 animate-in zoom-in-95 duration-300">
            <img
              src={loginPageLogo}
              alt={loginPageName}
              className="w-full h-full object-contain rounded-full select-none filter drop-shadow-sm"
            />
          </div>

          {/* Extra Large Shop Name on Mobile */}
          <div className="relative z-10 space-y-1 mb-1">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-lg leading-tight">
              {loginPageName}
            </h2>
            <div className="h-1 w-12 bg-white/40 rounded-full mx-auto mt-1 animate-pulse" />
          </div>

          {/* Organic Wave Edge Cutout SVG Transition */}
          <div className="absolute -bottom-1 left-0 right-0 w-full overflow-hidden leading-none z-20 text-white fill-current">
            <svg className="w-full h-4 sm:h-6" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d="M0,0 C150,80 350,-30 500,50 C650,130 900,10 1200,30 L1200,120 L0,120 Z" fill="#ffffff" />
            </svg>
          </div>

          {isCheckingCloud && (
            <div className="absolute top-2 right-3 flex items-center gap-1 text-[10px] font-bold text-purple-200 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Cloud...</span>
            </div>
          )}
        </div>

        {/* ================= DESKTOP & MAIN CONTENT GRID ================= */}
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden min-h-0">
          
          {/* ================= LEFT SIDE: FORM INPUTS ================= */}
          <div className="lg:col-span-7 p-4 sm:p-8 lg:p-10 bg-white flex flex-col justify-between flex-1 overflow-hidden z-20">
            
            {/* Desktop-only Top Bar */}
            <div className="hidden lg:flex items-center justify-between mb-2">
              <span className="text-xs font-black tracking-wider text-purple-700 uppercase">
                {mode === 'login' ? 'Authentication' : mode === 'register' ? 'New Account' : 'Reset Password'}
              </span>

              {isCheckingCloud && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-600 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking Cloud DB...</span>
                </div>
              )}
            </div>

            {/* Form Content Router */}
            <div className="flex-1 flex flex-col justify-center my-auto overflow-hidden py-1">
              {mode === 'register' ? (
                /* ================= ADMIN REGISTRATION FORM ================= */
                <form onSubmit={handleRegisterSubmit} className="space-y-2.5 sm:space-y-3.5 animate-in fade-in duration-300">
                  <div className="text-center space-y-0.5 mb-1">
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Create Admin</h1>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium">Set up your Master Admin store owner account</p>
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <div className="relative flex items-center">
                      <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Full Name"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition"
                      />
                    </div>

                    <div className="relative flex items-center">
                      <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                        <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <input
                        type="email"
                        placeholder="Admin E-mail Address"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition"
                      />
                    </div>

                    <div className="relative flex items-center">
                      <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                        <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <input
                        type="password"
                        placeholder="Master Password (Min 6 chars)"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition"
                      />
                    </div>

                    <div className="relative flex items-center">
                      <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                        <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <input
                        type="password"
                        placeholder="Confirm Master Password"
                        required
                        minLength={6}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className="w-full pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isGeneratingSetup}
                    className="w-full py-3 sm:py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    {isGeneratingSetup ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating 2FA Key...</span>
                      </>
                    ) : (
                      <>
                        <span>CREATE ADMIN ACCOUNT</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <p className="text-center text-[11px] sm:text-xs text-slate-500 font-medium pt-1">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-purple-600 font-bold hover:underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  </p>
                </form>
              ) : mode === 'login' ? (
                /* ================= LOGIN ROUTER ================= */
                <div className="w-full space-y-2.5 sm:space-y-4 animate-in fade-in duration-300">
                  
                  {/* Admin vs Salesman Account Tab Switcher (Only visible when salesman accounts exist) */}
                  {adminLoginStep === 'credentials' && salesmenCount > 0 && (
                    <div className="flex bg-slate-100 p-1 rounded-full mb-2 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setActiveTab('admin')}
                        className={`flex-1 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold rounded-full transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'admin'
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Administrator</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('salesman')}
                        className={`flex-1 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold rounded-full transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'salesman'
                            ? 'bg-purple-600 text-white shadow-md'
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
                    <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
                      <div className="text-center space-y-0.5">
                        <div className="inline-flex p-2.5 bg-purple-50 text-purple-600 rounded-full mb-1">
                          <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                          2FA Passcode Required
                        </h2>
                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                          Enter 6-digit code from Google Authenticator for:
                        </p>
                        <span className="inline-block px-3 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-mono font-bold">
                          {pendingAdminUser?.email}
                        </span>
                      </div>

                      <form onSubmit={handleVerifyAdminTotp} className="space-y-3">
                        <div>
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
                            className="w-full text-center text-2xl sm:text-3xl font-mono font-black tracking-[0.4em] py-2.5 sm:py-3.5 bg-slate-50 border-2 border-purple-200 focus:border-purple-600 rounded-3xl text-slate-900 outline-none transition shadow-inner"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={totpInputCode.length !== 6}
                          className={`w-full py-3 sm:py-4 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                            totpInputCode.length === 6
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-600/30'
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
                            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                          >
                            Back to Email &amp; Password
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : activeTab === 'admin' && adminLoginStep === 'setup' ? (
                    /* ================= INITIAL 2FA QR CODE SETUP STEP ================= */
                    <div className="space-y-2.5 animate-in slide-in-from-right-4 duration-300">
                      <div className="text-center space-y-0.5">
                        <h2 className="text-base sm:text-xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-1.5">
                          <QrCode className="w-5 h-5 text-purple-600" />
                          <span>Setup Google Authenticator</span>
                        </h2>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Scan QR Code to pair account (<strong>{pendingAdminUser?.email}</strong>)
                        </p>
                      </div>

                      {/* QR Code Container */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center space-y-1.5">
                        {isGeneratingSetup ? (
                          <div className="w-28 h-28 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
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

                        <div className="w-full flex items-center justify-between gap-2 bg-white border border-purple-100 rounded-xl px-2 py-1">
                          <code className="text-[10px] font-mono font-black text-purple-900 truncate">
                            {totpSetupData?.secret}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopySetupSecret}
                            className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold flex items-center gap-1 shrink-0"
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
                          className="w-full text-center text-lg font-mono font-black tracking-widest py-2 bg-slate-50 border border-purple-200 rounded-2xl text-slate-900 outline-none transition"
                        />

                        <button
                          type="submit"
                          disabled={totpInputCode.length !== 6}
                          className={`w-full py-3 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                            totpInputCode.length === 6
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-purple-600/30'
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
                    <form onSubmit={handleLoginSubmit} className="space-y-2.5 sm:space-y-4">
                      <div className="text-center space-y-0.5 mb-1">
                        <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">Hello!</h1>
                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium">Sign in to your account</p>
                      </div>

                      <div className="space-y-2 sm:space-y-3.5">
                        {/* E-mail Input Field */}
                        <div className="relative flex items-center">
                          <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                            <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <input
                            type="email"
                            placeholder="E-mail address"
                            required
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="w-full pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition focus:bg-white focus:ring-4 focus:ring-purple-600/10"
                          />
                        </div>

                        {/* Password Input Field */}
                        <div className="relative flex items-center">
                          <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            required
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="w-full pl-11 sm:pl-13 pr-10 sm:pr-12 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition focus:bg-white focus:ring-4 focus:ring-purple-600/10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 text-slate-400 hover:text-purple-600 transition cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          </button>
                        </div>

                        {/* Options: Remember me & Forgot Password */}
                        <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold px-2 text-slate-600">
                          <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900">
                            <input
                              type="checkbox"
                              defaultChecked
                              className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
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
                              className="text-purple-600 hover:underline font-bold cursor-pointer"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Pill Shaped SIGN IN Button */}
                      <button
                        type="submit"
                        className="w-full py-3 sm:py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 active:scale-[0.98] text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer mt-1"
                      >
                        <span>SIGN IN</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {/* Don't have an account link */}
                      <p className="text-center text-[11px] sm:text-xs text-slate-500 font-medium pt-1">
                        Don't have an account?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('register')}
                          className="text-purple-600 font-bold hover:underline cursor-pointer"
                        >
                          Create Admin
                        </button>
                      </p>
                    </form>
                  )}
                </div>
              ) : (
                /* ================= FORGOT PASSWORD MODE ================= */
                <div className="w-full space-y-3 animate-in fade-in duration-300">
                  {forgotStep === 'email' ? (
                    <form onSubmit={handleRequestForgotOtp} className="space-y-3">
                      <div className="text-center space-y-0.5">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Reset Password</h2>
                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                          Enter your Admin Email address to verify account
                        </p>
                      </div>

                      <div className="relative flex items-center">
                        <div className="absolute left-1.5 p-2 sm:p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                          <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <input
                          type="email"
                          placeholder="Admin E-mail Address"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="w-full pl-11 sm:pl-13 pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-3xl text-xs sm:text-sm font-semibold outline-none transition"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 sm:py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white font-black text-xs sm:text-sm tracking-wider uppercase rounded-full shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>PROCEED TO RESET</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <p className="text-center text-[11px] sm:text-xs text-slate-500 font-medium">
                        Remembered your password?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="text-purple-600 font-bold hover:underline cursor-pointer"
                        >
                          Back to Sign In
                        </button>
                      </p>
                    </form>
                  ) : (
                    <form onSubmit={handleSaveNewPasswordWithOtp} className="space-y-2.5">
                      <div className="text-center space-y-0.5">
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">Set New Password</h2>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Resetting password for <strong>{forgotEmail}</strong>
                        </p>
                      </div>

                      {forgotTargetAdmin?.is2faEnabled && (
                        <div>
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="6-Digit 2FA Passcode"
                            required
                            value={forgotTotpCode}
                            onChange={(e) => setForgotTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full text-center text-base font-mono font-bold tracking-[0.4em] py-2 bg-slate-50 border border-purple-200 rounded-2xl text-slate-800 outline-none transition"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <input
                          type="password"
                          placeholder="New Password (Min 6 chars)"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-2xl text-xs sm:text-sm font-semibold outline-none transition"
                        />

                        <input
                          type="password"
                          placeholder="Confirm New Password"
                          required
                          minLength={6}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 focus:border-purple-600 rounded-2xl text-xs sm:text-sm font-semibold outline-none transition"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Lock className="w-4 h-4" />
                        <span>SAVE NEW PASSWORD</span>
                      </button>

                      <div className="text-center pt-0.5">
                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                        >
                          Back to Sign In
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ================= DESKTOP-ONLY RIGHT SIDE: PURPLE GRADIENT PANEL WITH HUGE CIRCLE & LARGE LOGO ================= */}
          <div className="hidden lg:flex lg:col-span-5 w-full bg-gradient-to-br from-[#7e22ce] via-[#6366f1] to-[#4c1d95] p-6 sm:p-10 text-white flex-col items-center justify-center relative overflow-hidden shrink-0 lg:min-h-[560px]">
            {/* Background Organic Radial Glow */}
            <div className="absolute top-[-20%] right-[-20%] w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />

            {/* Cloud/Wave Curved Mask Overlay */}
            <div className="absolute left-[-1px] top-0 bottom-0 w-12 pointer-events-none z-10 text-white fill-current">
              <svg className="h-full w-full" viewBox="0 0 100 800" preserveAspectRatio="none">
                <path d="M0,0 C40,150 80,250 40,400 C0,550 50,680 0,800 L0,800 L0,0 Z" />
              </svg>
            </div>

            {/* EXTRA LARGE ELEGANT WHITE CIRCLE WITH BOLD SHOP LOGO */}
            <div className="relative z-20 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-300">
              
              {/* Extra Large Circle Badge Container (Large 280px Diameter Circle) */}
              <div className="w-64 h-64 xl:w-72 xl:h-72 bg-white rounded-full p-4 sm:p-5 shadow-[0_25px_70px_rgba(0,0,0,0.4)] border-4 border-white/50 flex items-center justify-center relative group transition hover:scale-105 duration-300">
                <img
                  src={loginPageLogo}
                  alt={loginPageName}
                  className="w-full h-full object-contain filter drop-shadow-md rounded-full select-none"
                />
              </div>

              {/* Brand Store Title */}
              <div className="space-y-1">
                <h2 className="text-2xl xl:text-3xl font-black text-white tracking-tight drop-shadow-md">
                  {loginPageName}
                </h2>
                <div className="h-1 w-14 bg-white/40 rounded-full mx-auto mt-2 animate-pulse" />
              </div>

              <div className="pt-2 text-[10px] text-purple-200/80 font-mono tracking-wider">
                Multi-Tenant Store Active
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
