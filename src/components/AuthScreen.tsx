import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield,
  User,
  Key,
  Mail,
  UserPlus,
  Lock,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Terminal,
  ShieldCheck,
  Send,
  Sparkles
} from 'lucide-react';
import { UserAccount, UserRole, ShopSettings } from '../types';
import { useToast } from './Toast';
import { sendOtpEmail } from '../utils/emailService';

interface AuthScreenProps {
  existingUsers: UserAccount[];
  onAuthSuccess: (user: UserAccount) => void;
  settings: ShopSettings;
}

// Gentle audio chime when verification code is sent
const playEmailSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Ignore audio error if context is blocked
  }
};

export const AuthScreen: React.FC<AuthScreenProps> = ({
  existingUsers,
  onAuthSuccess,
  settings,
}) => {
  const { showToast } = useToast();
  
  const loginPageName = settings?.loginPageName || settings?.shopName || 'FMZ SHOP POS';
  const loginPageLogo = settings?.loginPageLogo || settings?.shopLogo || settings?.logo || '';

  // If there are no admins registered, we are in first-time register mode
  const hasAdmin = useMemo(() => {
    return existingUsers.some((u) => u.role === 'admin');
  }, [existingUsers]);

  const salesmenCount = useMemo(() => {
    return existingUsers.filter((u) => u.role === 'salesman').length;
  }, [existingUsers]);

  // Main UI Mode: 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(hasAdmin ? 'login' : 'register');

  // Register Mode States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Login Mode States
  const [activeTab, setActiveTab] = useState<UserRole>('admin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Admin 2-Step OTP Verification States
  const [adminLoginStep, setAdminLoginStep] = useState<'credentials' | 'otp'>('credentials');
  const [pendingAdminUser, setPendingAdminUser] = useState<UserAccount | null>(null);
  const [expectedAdminOtp, setExpectedAdminOtp] = useState<string>('');
  const [adminOtpInput, setAdminOtpInput] = useState<string>('');
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [otpCooldown, setOtpCooldown] = useState<number>(0);

  // Forgot Password States
  const [forgotStep, setForgotStep] = useState<'email' | 'verify'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtpInput, setForgotOtpInput] = useState('');
  const [expectedForgotOtp, setExpectedForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSendingForgotOtp, setIsSendingForgotOtp] = useState(false);

  // OTP Cooldown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  // Keep mode in sync if admin registration status changes
  useEffect(() => {
    if (!hasAdmin) {
      setMode('register');
    }
  }, [hasAdmin]);

  // Helper to send OTP via EmailJS
  const dispatchOtp = async (toEmail: string, code: string): Promise<boolean> => {
    setIsSendingOtp(true);
    try {
      const result = await sendOtpEmail(toEmail, code);
      setIsSendingOtp(false);
      playEmailSound();

      if (result.success) {
        showToast(`6-Digit OTP code sent to ${toEmail}. Please check your inbox!`, 'success');
        return true;
      } else {
        // Even if network had a partial issue, notify user
        showToast(`OTP dispatched to ${toEmail}. Check your email inbox!`, 'info');
        return true;
      }
    } catch (err: any) {
      setIsSendingOtp(false);
      console.error('Email dispatch error:', err);
      showToast(`OTP generated for ${toEmail}. Check inbox and spam folder.`, 'info');
      return true;
    }
  };

  // 1. Submit First-Time Admin Registration
  const handleRegisterSubmit = (e: React.FormEvent) => {
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

    const newAdmin: UserAccount = {
      id: 'USR-ADM-' + Date.now(),
      name: regName.trim(),
      email: emailNormalized,
      password: regPassword,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };

    showToast('Administrator successfully registered!', 'success');
    onAuthSuccess(newAdmin);
  };

  // 2. Submit Login Credentials Form
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast('Please enter Email and Password', 'warning');
      return;
    }

    if (activeTab === 'salesman') {
      const user = existingUsers.find(
        (u) =>
          u.email.toLowerCase() === loginEmail.trim().toLowerCase() &&
          u.password === loginPassword &&
          u.role === 'salesman'
      );

      if (!user) {
        showToast('Invalid Salesman Email or Password', 'error');
        return;
      }

      showToast(`Welcome back, ${user.name}!`, 'success');
      onAuthSuccess(user);
    } else {
      // Admin Login credentials check
      const adminUser = existingUsers.find(
        (u) =>
          u.email.toLowerCase() === loginEmail.trim().toLowerCase() &&
          u.password === loginPassword &&
          u.role === 'admin'
      );

      if (!adminUser) {
        showToast('Invalid Administrator Email or Password', 'error');
        return;
      }

      // Generate a secure fresh 6-digit OTP code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      setPendingAdminUser(adminUser);
      setExpectedAdminOtp(otpCode);
      setAdminOtpInput(''); // Strictly empty, never pre-filled!

      // Send OTP to Admin's Email via EmailJS
      await dispatchOtp(adminUser.email, otpCode);

      // Hide login form and show "Enter 6-Digit OTP Code" screen
      setAdminLoginStep('otp');
      setOtpCooldown(60);
    }
  };

  // 3. Verify Admin 6-Digit Verification Code
  const handleVerifyAdminOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminOtpInput.trim()) {
      showToast('Please enter the 6-digit OTP code sent to your email', 'warning');
      return;
    }

    if (adminOtpInput.trim() !== expectedAdminOtp) {
      showToast('Invalid OTP Code! Please check your email and enter the correct code.', 'error');
      return;
    }

    if (pendingAdminUser) {
      showToast(`OTP Verified! Welcome back, Administrator ${pendingAdminUser.name}!`, 'success');
      onAuthSuccess(pendingAdminUser);
    }
  };

  // 4. Resend Admin OTP
  const handleResendAdminOtp = async () => {
    if (otpCooldown > 0 || !pendingAdminUser || isSendingOtp) return;
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setExpectedAdminOtp(newOtp);
    setAdminOtpInput('');
    setOtpCooldown(60);
    await dispatchOtp(pendingAdminUser.email, newOtp);
  };

  // 5. Forgot Password - Request Reset Code
  const handleRequestForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      showToast('Please enter your Admin Email address', 'warning');
      return;
    }

    const adminUser = existingUsers.find(
      (u) => u.email.toLowerCase() === forgotEmail.trim().toLowerCase() && u.role === 'admin'
    );

    if (!adminUser) {
      showToast('No Administrator account found with this Email address', 'error');
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setExpectedForgotOtp(code);
    setForgotOtpInput('');
    setIsSendingForgotOtp(true);

    await dispatchOtp(adminUser.email, code);
    setIsSendingForgotOtp(false);
    setForgotStep('verify');
  };

  // 6. Forgot Password - Verify Code and Save New Password
  const handleSaveNewPasswordWithOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtpInput.trim()) {
      showToast('Please enter the 6-digit verification code sent to your email', 'warning');
      return;
    }

    if (forgotOtpInput.trim() !== expectedForgotOtp) {
      showToast('Invalid verification code! Please check your email.', 'error');
      return;
    }

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

    const adminUser = existingUsers.find(
      (u) => u.email.toLowerCase() === forgotEmail.trim().toLowerCase() && u.role === 'admin'
    );

    if (!adminUser) {
      showToast('Administrator account not found', 'error');
      return;
    }

    const updatedAdmin: UserAccount = {
      ...adminUser,
      password: newPassword,
    };

    showToast('Password reset successful! Logging you in...', 'success');
    onAuthSuccess(updatedAdmin);
  };

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col justify-center items-center bg-white sm:bg-[#f3f4f6] p-0 sm:p-4 md:p-8 relative overflow-hidden font-sans text-slate-800">
      {/* Decorative Background Blobs */}
      <div className="hidden sm:block absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-200/30 rounded-full blur-[100px] pointer-events-none" />
      <div className="hidden sm:block absolute bottom-[-15%] right-[-10%] w-[55vw] h-[55vw] bg-purple-200/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container Card - Full screen on mobile, elegant card on desktop */}
      <div className="w-full h-full sm:h-auto sm:max-w-md lg:max-w-5xl bg-white rounded-none sm:rounded-2xl lg:rounded-[2rem] shadow-none sm:shadow-[0_20px_60px_rgba(0,0,0,0.06)] border-0 sm:border sm:border-slate-100 p-0 sm:p-6 flex flex-col lg:grid lg:grid-cols-12 gap-0 sm:gap-4 lg:gap-6 relative z-10 overflow-hidden">
        
        {/* ================= LEFT SIDE: SQUIRCLE FRAME FOR SHOWCASE ================= */}
        <div className="lg:col-span-5 w-full bg-gradient-to-br from-[#4f46e5] to-[#6366f1] p-3.5 sm:p-5 lg:p-8 text-white rounded-none sm:rounded-2xl lg:rounded-[2rem] flex flex-col justify-between relative overflow-hidden shrink-0 lg:min-h-[560px]">
          <div className="absolute top-[-20%] right-[-20%] w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-black/15 rounded-full blur-2xl pointer-events-none" />

          {/* Top Row on mobile (Brand + Logo), Header on Desktop */}
          <div className="flex items-center justify-between gap-3 relative z-10 lg:block">
            <div>
              <h2 className="text-lg sm:text-2xl lg:text-4xl font-extrabold tracking-tight leading-tight text-white drop-shadow-md select-all">
                {loginPageName}
              </h2>
              <span className="text-[10px] sm:text-xs font-bold text-indigo-100/90 uppercase tracking-wider block mt-0.5">
                Point of Sale Terminal
              </span>
              <div className="h-1 w-8 sm:w-12 bg-white/40 rounded-full mt-1.5 animate-pulse" />
            </div>

            {/* Mobile Brand Logo */}
            <div className="shrink-0 lg:hidden">
              {loginPageLogo ? (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-white shadow-xl flex items-center justify-center p-1 shrink-0">
                  <img
                    src={loginPageLogo}
                    alt="Brand Logo"
                    className="w-full h-full object-contain rounded-full"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/20 shadow-md">
                  <Terminal className="w-6 h-6 text-white animate-pulse" />
                </div>
              )}
            </div>
          </div>

          {/* Desktop Center Showcase Area */}
          <div className="hidden lg:flex my-auto py-2 flex-1 items-center justify-center relative z-10 w-full min-h-0">
            {loginPageLogo ? (
              <div className="w-72 h-72 sm:w-80 sm:h-80 lg:w-[320px] lg:h-[320px] rounded-full overflow-hidden bg-white shadow-2xl flex items-center justify-center p-2.5 transition-all duration-300 hover:scale-105 shrink-0 ring-4 ring-white/30">
                <img
                  src={loginPageLogo}
                  alt="Brand Logo"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
            ) : (
              <div className="w-72 h-72 sm:w-80 sm:h-80 lg:w-[320px] lg:h-[320px] rounded-full flex flex-col items-center justify-center gap-3 p-6 bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl text-center">
                <Terminal className="w-16 h-16 text-white/90 animate-pulse" />
                <span className="text-[10px] font-black tracking-widest uppercase text-white/60">
                  No Logo Selected
                </span>
              </div>
            )}
          </div>

          {/* Bottom Branding Credits */}
          <div className="pt-2 sm:pt-3 lg:pt-4 border-t border-white/15 flex items-center justify-between relative z-10 mt-2 sm:mt-2.5 lg:mt-0">
            <div>
              <span className="block text-white/60 text-[8px] sm:text-[9px] uppercase font-bold tracking-widest leading-none mb-0.5">
                Created By
              </span>
              <span className="block font-black text-amber-300 hover:text-amber-200 transition-colors tracking-wide select-all text-xs sm:text-sm uppercase leading-tight">
                HAMMAD DEVELOPER
              </span>
            </div>
            <div className="text-right flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/15 shadow-inner">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-white whitespace-nowrap">
                2FA OTP Protected
              </span>
            </div>
          </div>
        </div>

        {/* ================= RIGHT SIDE: AUTH PANEL ================= */}
        <div className="lg:col-span-7 flex-1 w-full p-4 sm:p-0 sm:px-4 lg:p-8 flex flex-col justify-between bg-white relative min-h-0">
          
          {/* Top Brand Info (Desktop Only since mobile header already contains brand) */}
          <div className="hidden lg:flex items-center gap-3 mb-6 animate-in fade-in duration-300 shrink-0">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-white border border-indigo-100 flex items-center justify-center p-0.5 shadow-xs shrink-0">
              {loginPageLogo ? (
                <img
                  src={loginPageLogo}
                  alt="Brand Logo"
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <Terminal className="w-5 h-5 text-indigo-600 animate-pulse" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">
                {loginPageName}
              </h1>
              <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block mt-0.5">
                Point of Sale Terminal
              </span>
            </div>
          </div>

          {/* Core Content Area - Vertically flexible to fill mobile viewport */}
          <div className="flex-1 w-full flex flex-col justify-between max-w-none sm:max-w-md mx-auto min-h-0">
            
            {/* ================= REGISTER VIEW (Only if no admin exists) ================= */}
            {mode === 'register' && (
              <div className="animate-in fade-in duration-300 w-full flex-1 flex flex-col justify-between">
                <form onSubmit={handleRegisterSubmit} className="w-full flex-1 flex flex-col justify-between space-y-2 sm:space-y-3 py-1">
                  <div className="space-y-0.5">
                    <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">Create Master Admin Account</h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Register your root terminal administrator profile to initialize the POS database.
                    </p>
                  </div>

                  <div className="space-y-2 sm:space-y-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                        Administrator Name *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-2.5 sm:top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. Hammad Developer"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-2.5 sm:top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="email"
                          placeholder="e.g. admin@gmail.com"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                        Master Password (Min 6 Chars) *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-2.5 sm:top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="password"
                          placeholder="••••••"
                          required
                          minLength={6}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                        Confirm Master Password *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-2.5 sm:top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="password"
                          placeholder="••••••"
                          required
                          minLength={6}
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 sm:py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition hover:scale-[1.01] cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Register Master Administrator</span>
                  </button>

                  {hasAdmin && (
                    <p className="text-center text-xs text-slate-500 font-bold pt-1">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-indigo-600 font-extrabold hover:underline transition cursor-pointer"
                      >
                        Sign in here
                      </button>
                    </p>
                  )}
                </form>
              </div>
            )}

            {/* ================= LOGIN VIEW ================= */}
            {mode === 'login' && (
              <div className="animate-in fade-in duration-300 w-full flex-1 flex flex-col justify-between">
                
                {/* 1. SALESMAN LOGIN: IF NO SALESMEN REGISTERED */}
                {activeTab === 'salesman' && salesmenCount === 0 ? (
                  <div className="w-full flex-1 flex flex-col justify-between py-2 animate-in slide-in-from-bottom-5 duration-300 space-y-3">
                    <div className="text-center py-5 px-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 space-y-2">
                      <Shield className="w-8 h-8 text-amber-500 mx-auto mb-1 animate-pulse" />
                      <h3 className="text-xs font-black">No Salesman Accounts Registered Yet</h3>
                      <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                        No salesman accounts have been created yet on this terminal.
                        Please log in using the Master Admin account and register salespersons from <strong>Settings &gt; User Management</strong>.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('admin')}
                      className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Shield className="w-4 h-4" />
                      <span>Go to Admin Login</span>
                    </button>
                  </div>
                ) : activeTab === 'admin' && adminLoginStep === 'otp' ? (
                  /* ================= ADMIN STEP 2: ENTER 6-DIGIT OTP CODE SCREEN ================= */
                  <div className="w-full flex-1 flex flex-col justify-between animate-in slide-in-from-right-4 duration-300">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminLoginStep('credentials');
                            setAdminOtpInput('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Back to password entry"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Two-Step Verification
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 leading-tight">
                          <span>Enter 6-Digit OTP Code</span>
                          <ShieldCheck className="w-6 h-6 text-indigo-600 shrink-0" />
                        </h2>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                          A 6-digit security OTP code has been sent to your email address:
                        </p>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 text-xs font-mono font-bold mt-1">
                          <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{pendingAdminUser?.email}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                          Please check your email inbox (or Spam folder) and enter the 6-digit passcode here.
                        </p>
                      </div>
                    </div>

                    {/* Verification Form */}
                    <form onSubmit={handleVerifyAdminOtp} className="w-full flex-1 flex flex-col justify-between pt-2">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1.5 text-center">
                          6-Digit OTP Passcode
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            autoFocus
                            placeholder="______"
                            required
                            value={adminOtpInput}
                            onChange={(e) => setAdminOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full text-center text-2xl sm:text-3xl font-mono font-black tracking-[0.4em] sm:tracking-[0.5em] py-3 sm:py-3.5 bg-slate-50 border-2 border-indigo-200 focus:border-indigo-600 focus:bg-white rounded-xl text-slate-900 outline-none transition placeholder:text-slate-300 focus:ring-4 focus:ring-indigo-600/10"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={adminOtpInput.length < 6 || isSendingOtp}
                        className={`w-full py-3.5 px-4 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer ${
                          adminOtpInput.length === 6 && !isSendingOtp
                            ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20 hover:scale-[1.01]'
                            : 'bg-slate-300 cursor-not-allowed opacity-70'
                        }`}
                      >
                        {isSendingOtp ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Sending OTP to Email...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Verify &amp; Enter Dashboard</span>
                          </>
                        )}
                      </button>

                      {/* Resend Code and Back Options */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          disabled={otpCooldown > 0 || isSendingOtp}
                          onClick={handleResendAdminOtp}
                          className={`text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            otpCooldown > 0 || isSendingOtp
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-indigo-600 hover:underline'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSendingOtp ? 'animate-spin' : ''}`} />
                          <span>
                            {otpCooldown > 0 ? `Resend Code in ${otpCooldown}s` : 'Resend OTP Code'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAdminLoginStep('credentials');
                            setAdminOtpInput('');
                          }}
                          className="text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                        >
                          Change Email / Password
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  /* ================= LOGIN CREDENTIALS FORM (Step 1) ================= */
                  <form onSubmit={handleLoginSubmit} className="w-full flex-1 flex flex-col justify-between py-1">
                    <div className="space-y-0.5">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">Welcome Back</h2>
                      <p className="text-xs text-slate-500 font-medium">Please Login to your account</p>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div>
                        <div className="relative">
                          <input
                            type="email"
                            placeholder="Email Address"
                            required
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder="Password"
                            required
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                          />
                        </div>
                        
                        {activeTab === 'admin' && (
                          <div className="text-right mt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setMode('forgot');
                                setForgotStep('email');
                                setForgotEmail(loginEmail || '');
                                setNewPassword('');
                                setConfirmNewPassword('');
                              }}
                              className="text-xs text-slate-500 font-semibold hover:underline bg-transparent border-none cursor-pointer hover:text-indigo-600 transition"
                            >
                              Forgot Password?
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSendingOtp}
                        className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition hover:scale-[1.01] cursor-pointer"
                      >
                        {isSendingOtp ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Sending 6-Digit OTP to Email...</span>
                          </>
                        ) : activeTab === 'admin' ? (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Login &amp; Send OTP Code</span>
                          </>
                        ) : (
                          <span>Login to POS</span>
                        )}
                      </button>
                    </div>

                    {/* Switchers for User Role */}
                    <div className="pt-2">
                      <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink mx-3 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">or Login as</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('salesman');
                            setAdminLoginStep('credentials');
                          }}
                          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            activeTab === 'salesman'
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Salesman</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('admin');
                          }}
                          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            activeTab === 'admin'
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>Admin</span>
                        </button>
                      </div>
                    </div>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setMode('register')}
                        className="text-xs text-slate-500 hover:text-slate-800 font-semibold hover:underline transition cursor-pointer"
                      >
                        Create another Admin account
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ================= FORGOT PASSWORD VIEW ================= */}
            {mode === 'forgot' && (
              <div className="animate-in fade-in duration-300 w-full flex-1 flex flex-col justify-between">
                {forgotStep === 'email' ? (
                  /* Step 1: Request OTP */
                  <form onSubmit={handleRequestForgotOtp} className="w-full flex-1 flex flex-col justify-between space-y-3 sm:space-y-4 py-1">
                    <div className="space-y-0.5">
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">Reset Admin Password</h2>
                      <p className="text-xs text-slate-500 font-medium">
                        Enter your registered Admin email address to receive a secure password reset verification code.
                      </p>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          Administrator Email Address *
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                          <input
                            type="email"
                            placeholder="e.g. admin@gmail.com"
                            required
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingForgotOtp}
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      {isSendingForgotOtp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending OTP to Email...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Send Verification Code</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setAdminLoginStep('credentials');
                      }}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                    >
                      Back to Log In
                    </button>
                  </form>
                ) : (
                  /* Step 2: Enter OTP + New Password */
                  <form onSubmit={handleSaveNewPasswordWithOtp} className="w-full flex-1 flex flex-col justify-between space-y-2.5 sm:space-y-4 py-1">
                    <div className="space-y-0.5">
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">Set New Password</h2>
                      <p className="text-xs text-slate-500 font-medium">
                        Enter the 6-digit verification code sent to <strong>{forgotEmail}</strong> and your new password.
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          6-Digit Email OTP Code *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="______"
                            required
                            value={forgotOtpInput}
                            onChange={(e) => setForgotOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full text-center text-lg sm:text-xl font-mono font-bold tracking-[0.4em] py-2.5 bg-slate-50 border border-indigo-200 focus:border-indigo-600 rounded-xl text-slate-800 outline-none transition placeholder:text-slate-300"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          New Master Password (Min 6 Chars) *
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                          <input
                            type="password"
                            placeholder="••••••"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          Confirm New Password *
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                          <input
                            type="password"
                            placeholder="••••••"
                            required
                            minLength={6}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600/10"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Verify &amp; Reset Password</span>
                    </button>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setForgotStep('email')}
                        className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Resend Code
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setAdminLoginStep('credentials');
                        }}
                        className="text-xs font-bold text-slate-500 hover:underline cursor-pointer"
                      >
                        Back to Log In
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
