import React, { useState, useMemo } from 'react';
import { ShopSettings, AppData, AppTheme, UserAccount, DailyBackupSnapshot } from '../types';
import {
  X,
  Settings as SettingsIcon,
  Download,
  Upload,
  Store,
  Palette,
  Check,
  Camera,
  Trash2,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Users,
  UserPlus,
  Mail,
  Lock,
  Receipt,
  Key,
  RefreshCw,
  QrCode,
  Clock,
  RotateCcw,
  Database,
} from 'lucide-react';
import { useToast } from './Toast';
import {
  validateBackupData,
  CURRENT_BACKUP_VERSION,
  saveUserToFirestore,
  deleteUserFromFirestore,
  listAutomaticBackups,
  downloadJsonBackup,
  calculateStorageUsageStats,
  DEFAULT_STORE_ID,
} from '../utils/storage';
import { firebaseConfig } from '../utils/firebase';
import { CameraCaptureModal } from './CameraCaptureModal';
import { TotpSetupModal } from './TotpSetupModal';

export interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
  onSaveSettings: (settings: ShopSettings) => void;
  fullData: AppData;
  onReplaceData: (data: AppData) => void;
  onUpdateUsers?: (users: UserAccount[]) => void;
  onRecoverMissingData?: () => Promise<number>;
}

const THEME_OPTIONS: { id: AppTheme; label: string; accent: string; border: string }[] = [
  { id: 'gold-black', label: '👑 Gold & Black (Royal Luxury)', accent: 'bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200', border: 'border-amber-500' },
  { id: 'dark', label: 'Dark Charcoal / Night Mode', accent: 'bg-slate-900', border: 'border-slate-800' },
  { id: 'blue-white', label: 'Blue & White (Default)', accent: 'bg-blue-600', border: 'border-blue-500' },
  { id: 'green-white', label: 'Green & White', accent: 'bg-emerald-600', border: 'border-emerald-500' },
  { id: 'red-white', label: 'Red & White', accent: 'bg-rose-600', border: 'border-rose-500' },
  { id: 'orange-white', label: 'Orange & White', accent: 'bg-orange-600', border: 'border-orange-500' },
  { id: 'purple-white', label: 'Purple & White', accent: 'bg-purple-600', border: 'border-purple-500' },
  { id: 'light', label: 'Light Slate', accent: 'bg-slate-700', border: 'border-slate-500' },
];

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  fullData,
  onReplaceData,
  onUpdateUsers,
  onRecoverMissingData,
}) => {
  const { showToast } = useToast();
  const [cameraModalConfig, setCameraModalConfig] = useState<{
    isOpen: boolean;
    target: 'shop' | 'invoice';
  }>({ isOpen: false, target: 'shop' });

  const [formData, setFormData] = useState<ShopSettings>({
    ...settings,
    shopLogo: settings.shopLogo || settings.logo || '',
    invoiceLogo: settings.invoiceLogo || '',
    theme: settings.theme || 'blue-white',
    returnPolicy: settings.returnPolicy || 'Items can only be returned within 3 days with original invoice.',
    lowStockThreshold: settings.lowStockThreshold !== undefined ? settings.lowStockThreshold : 2,
    loginPageName: settings.loginPageName || settings.shopName || 'FMZ SHOP POS',
    loginPageLogo: settings.loginPageLogo || '',
  });

  // Keep formData in sync when settings prop updates
  React.useEffect(() => {
    setFormData({
      ...settings,
      shopLogo: settings.shopLogo || settings.logo || '',
      invoiceLogo: settings.invoiceLogo || '',
      theme: settings.theme || 'blue-white',
      returnPolicy: settings.returnPolicy || 'Items can only be returned within 3 days with original invoice.',
      lowStockThreshold: settings.lowStockThreshold !== undefined ? settings.lowStockThreshold : 2,
      loginPageName: settings.loginPageName || settings.shopName || 'FMZ SHOP POS',
      loginPageLogo: settings.loginPageLogo || '',
    });
  }, [settings]);

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'branding' | 'backup' | 'users' | 'password'>('profile');
  const [automaticBackups, setAutomaticBackups] = useState<DailyBackupSnapshot[]>([]);
  const [loadingAutoBackups, setLoadingAutoBackups] = useState(false);
  const [isRecoveringData, setIsRecoveringData] = useState(false);

  React.useEffect(() => {
    if (isOpen && activeSubTab === 'backup') {
      setLoadingAutoBackups(true);
      listAutomaticBackups()
        .then(list => setAutomaticBackups(list))
        .catch(() => setAutomaticBackups([]))
        .finally(() => setLoadingAutoBackups(false));
    }
  }, [isOpen, activeSubTab]);

  // Salesman registration state
  const [salesmanName, setSalesmanName] = useState('');
  const [salesmanEmail, setSalesmanEmail] = useState('');
  const [salesmanPassword, setSalesmanPassword] = useState('');

  // Admin password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA Authenticator Modal State
  const [isTotpSetupOpen, setIsTotpSetupOpen] = useState(false);

  const currentAdminUser = useMemo(() => {
    return fullData.currentUser || fullData.users?.find(u => u.role === 'admin');
  }, [fullData]);

  // Pre-Restore Confirmation Modal State
  const [pendingRestoreData, setPendingRestoreData] = useState<AppData | null>(null);
  const [pendingRestoreSummary, setPendingRestoreSummary] = useState<{
    inventoryCount: number;
    salesCount: number;
    khataCount: number;
    expensesCount: number;
    purchasesCount: number;
    returnsCount: number;
    backupVersion: number;
  } | null>(null);
  const [pendingRestoreWarnings, setPendingRestoreWarnings] = useState<string[]>([]);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [safetyBackupCreated, setSafetyBackupCreated] = useState(false);
  const [confirmRestoreAgreement, setConfirmRestoreAgreement] = useState(false);

  // Salesman Password Change State (Modal & Form)
  const [salesmanForPasswordChange, setSalesmanForPasswordChange] = useState<UserAccount | null>(null);
  const [newSalesmanPassword, setNewSalesmanPassword] = useState('');
  const [confirmSalesmanPassword, setConfirmSalesmanPassword] = useState('');
  const [showSalesmanPassModal, setShowSalesmanPassModal] = useState(false);

  // Password Tab Dedicated Salesman Password Change State
  const [selectedSalesmanIdForTab, setSelectedSalesmanIdForTab] = useState<string>('');
  const [tabSalesmanNewPass, setTabSalesmanNewPass] = useState('');
  const [tabSalesmanConfirmPass, setTabSalesmanConfirmPass] = useState('');

  // Iframe-safe User Deletion State
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  const currentStoreId = fullData.currentUser?.storeId || fullData.currentUser?.id;
  const storeScopedUsers: UserAccount[] = useMemo(() => {
    return (fullData.users || []).filter((u: UserAccount) => {
      if (u.id === fullData.currentUser?.id) return true;
      if (currentStoreId && u.storeId) {
        return u.storeId === currentStoreId;
      }
      return true;
    });
  }, [fullData.users, fullData.currentUser, currentStoreId]);

  if (!isOpen) return null;

  // Handle Logo Upload (Base64 conversion)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo file size must be under 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setFormData(prev => ({
        ...prev,
        shopLogo: result,
        logo: result,
      }));
      showToast('Shop logo uploaded successfully', 'success');
    };
    reader.onerror = () => {
      showToast('Failed to load image file', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({
      ...prev,
      shopLogo: '',
      logo: '',
    }));
    showToast('Shop logo removed', 'info');
  };

  // Handle Invoice Dedicated Logo Upload (Base64 conversion)
  const handleInvoiceLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Invoice logo file size must be under 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setFormData(prev => ({
        ...prev,
        invoiceLogo: result,
      }));
      showToast('Dedicated Invoice Logo uploaded successfully!', 'success');
    };
    reader.onerror = () => {
      showToast('Failed to load image file', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveInvoiceLogo = () => {
    setFormData(prev => ({
      ...prev,
      invoiceLogo: '',
    }));
    showToast('Dedicated invoice logo removed. Will use main Shop Logo.', 'info');
  };

  const handleSelectTheme = (themeId: AppTheme) => {
    setFormData(prev => ({ ...prev, theme: themeId }));
    document.documentElement.setAttribute('data-theme', themeId);
    if (themeId === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('mobile_pos_theme', themeId);
    showToast(`Switched theme to "${themeId}"`, 'info');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedSettings: ShopSettings = {
      ...formData,
      lowStockThreshold: Number(formData.lowStockThreshold) >= 1 ? Number(formData.lowStockThreshold) : 2,
    };
    onSaveSettings(cleanedSettings);
    const selectedTheme = formData.theme || 'blue-white';
    document.documentElement.setAttribute('data-theme', selectedTheme);
    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('mobile_pos_theme', selectedTheme);
    showToast('Shop settings updated successfully', 'success');
    onClose();
  };

  // Export JSON Database Backup with versioning
  const handleExportData = (isSafetyCopy: boolean = false) => {
    const exportPayload: AppData = {
      ...fullData,
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = isSafetyCopy ? 'safety_backup_before_restore_' : 'mobile_pos_pro_backup_';
    a.download = `${prefix}${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (isSafetyCopy) {
      setSafetyBackupCreated(true);
      showToast('Safety backup downloaded! You can now safely proceed with restore.', 'success');
    } else {
      showToast(`Complete system backup exported successfully (Version ${CURRENT_BACKUP_VERSION})`, 'success');
    }
  };

  // Import JSON Database Backup with strict validation
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);

        // 1-5. Validate backup structure, required sections, arrays/objects, important fields, and version compatibility
        const validation = validateBackupData(parsed);

        if (!validation.valid || !validation.data) {
          showToast(validation.error || 'Backup validation failed', 'error');
          return;
        }

        // Show validation confirmation modal before replacing current data
        setPendingRestoreData(validation.data);
        setPendingRestoreSummary(validation.summary || null);
        setPendingRestoreWarnings(validation.warnings || []);
        setSafetyBackupCreated(false);
        setConfirmRestoreAgreement(false);
        setIsRestoreConfirmOpen(true);
      } catch (err: any) {
        showToast('Invalid JSON file format: ' + (err?.message || 'Parse error'), 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = () => {
    if (!pendingRestoreData) return;

    // Automatically download a safety JSON backup of current data before replacing
    downloadJsonBackup(fullData, 'auto_safety_before_restore_');

    onReplaceData(pendingRestoreData);

    if (pendingRestoreData.settings?.theme) {
      document.documentElement.setAttribute('data-theme', pendingRestoreData.settings.theme);
      localStorage.setItem('mobile_pos_theme', pendingRestoreData.settings.theme);
    }

    showToast('Database backup successfully restored!', 'success');
    setIsRestoreConfirmOpen(false);
    setPendingRestoreData(null);
    onClose();
  };

  const handleSelectAutomaticBackup = (backup: DailyBackupSnapshot) => {
    const validation = validateBackupData(backup.data);
    if (!validation.valid || !validation.data) {
      showToast(validation.error || 'Automatic backup snapshot is invalid', 'error');
      return;
    }
    setPendingRestoreData(validation.data);
    setPendingRestoreSummary(validation.summary || null);
    setPendingRestoreWarnings(validation.warnings || []);
    setSafetyBackupCreated(false);
    setConfirmRestoreAgreement(false);
    setIsRestoreConfirmOpen(true);
  };

  const handleManualRecoverMissingData = async () => {
    if (!onRecoverMissingData || isRecoveringData) return;
    setIsRecoveringData(true);
    try {
      await onRecoverMissingData();
    } finally {
      setIsRecoveringData(false);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      showToast('Please fill out all fields', 'warning');
      return;
    }

    const currentAdmin = fullData.currentUser;
    if (!currentAdmin) {
      showToast('No active user logged in', 'error');
      return;
    }

    if (oldPassword !== currentAdmin.password) {
      showToast('Current Password is incorrect', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showToast('New Password must be at least 6 characters long', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New Password and Confirmation do not match', 'error');
      return;
    }

    // Update password in the users list
    const existingUsers = fullData.users || [];
    const updatedUsers = existingUsers.map(usr => {
      if (usr.id === currentAdmin.id) {
        return {
          ...usr,
          password: newPassword,
        };
      }
      return usr;
    });

    if (onUpdateUsers) {
      onUpdateUsers(updatedUsers);
    }

    // Clear password inputs
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    showToast('Administrator Password updated successfully!', 'success');
  };

  const handleAddSalesman = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesmanName.trim() || !salesmanEmail.trim() || !salesmanPassword.trim()) {
      showToast('Please fill out all fields', 'warning');
      return;
    }
    if (salesmanPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'warning');
      return;
    }

    const emailLower = salesmanEmail.trim().toLowerCase();
    const existingUsers = fullData.users || [];
    if (existingUsers.some(u => u.email.toLowerCase() === emailLower)) {
      showToast('A user with this Email address already exists', 'error');
      return;
    }

    const currentAdminStoreId = DEFAULT_STORE_ID;
    const newSalesman: UserAccount = {
      id: 'USR-SLS-' + Date.now(),
      name: salesmanName.trim(),
      email: emailLower,
      password: salesmanPassword,
      role: 'salesman',
      storeId: currentAdminStoreId, // Explicitly tagged with parent Admin's storeId!
      createdAt: new Date().toISOString(),
    };

    const updatedUsers = [...existingUsers, newSalesman];
    saveUserToFirestore(newSalesman, currentAdminStoreId).catch((err) => {
      console.warn('Failed to save salesman account to Firestore:', err);
    });

    if (onUpdateUsers) {
      onUpdateUsers(updatedUsers);
    }
    
    // Clear form fields
    setSalesmanName('');
    setSalesmanEmail('');
    setSalesmanPassword('');
    showToast(`Salesman ${newSalesman.name} created successfully!`, 'success');
  };

  const handleOpenChangeSalesmanPassword = (usr: UserAccount) => {
    setSalesmanForPasswordChange(usr);
    setNewSalesmanPassword('');
    setConfirmSalesmanPassword('');
    setShowSalesmanPassModal(true);
  };

  const handleUpdateSalesmanPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesmanForPasswordChange) return;

    if (!newSalesmanPassword.trim() || !confirmSalesmanPassword.trim()) {
      showToast('Please fill out both password fields', 'warning');
      return;
    }

    if (newSalesmanPassword.length < 6) {
      showToast('New password must be at least 6 characters long', 'warning');
      return;
    }

    if (newSalesmanPassword !== confirmSalesmanPassword) {
      showToast('New Password and Confirmation do not match', 'error');
      return;
    }

    const existingUsers = fullData.users || [];
    const updatedUsers = existingUsers.map(u => {
      if (u.id === salesmanForPasswordChange.id) {
        return {
          ...u,
          password: newSalesmanPassword,
        };
      }
      return u;
    });

    if (onUpdateUsers) {
      onUpdateUsers(updatedUsers);
    }

    showToast(`Password for salesman "${salesmanForPasswordChange.name}" updated successfully!`, 'success');
    setShowSalesmanPassModal(false);
    setSalesmanForPasswordChange(null);
    setNewSalesmanPassword('');
    setConfirmSalesmanPassword('');
  };

  const handleUpdateSalesmanPasswordFromTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSalesmanIdForTab) {
      showToast('Please select a Salesman account first', 'warning');
      return;
    }

    const existingUsers = fullData.users || [];
    const targetSalesman = existingUsers.find(u => u.id === selectedSalesmanIdForTab);
    if (!targetSalesman) {
      showToast('Selected salesman not found', 'error');
      return;
    }

    if (!tabSalesmanNewPass.trim() || !tabSalesmanConfirmPass.trim()) {
      showToast('Please fill out both password fields', 'warning');
      return;
    }

    if (tabSalesmanNewPass.length < 6) {
      showToast('New password must be at least 6 characters long', 'warning');
      return;
    }

    if (tabSalesmanNewPass !== tabSalesmanConfirmPass) {
      showToast('New Password and Confirmation do not match', 'error');
      return;
    }

    const updatedUsers = existingUsers.map(u => {
      if (u.id === targetSalesman.id) {
        return {
          ...u,
          password: tabSalesmanNewPass,
        };
      }
      return u;
    });

    if (onUpdateUsers) {
      onUpdateUsers(updatedUsers);
    }

    showToast(`Password for salesman "${targetSalesman.name}" updated successfully!`, 'success');
    setTabSalesmanNewPass('');
    setTabSalesmanConfirmPass('');
  };

  const handleDeleteUser = (userId: string) => {
    const existingUsers = fullData.users || [];
    const targetUser = existingUsers.find(u => u.id === userId);
    if (!targetUser) return;
    
    if (targetUser.role === 'admin') {
      const adminCount = existingUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        showToast('Cannot delete the last Administrator account!', 'error');
        return;
      }
    }

    setUserToDelete(targetUser);
  };

  const handleConfirmDeleteUser = () => {
    if (!userToDelete) return;
    const existingUsers = fullData.users || [];
    if (userToDelete.role === 'admin') {
      const adminCount = existingUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        showToast('Cannot delete the last Administrator account!', 'error');
        setUserToDelete(null);
        return;
      }
    }

    const updatedUsers = existingUsers.filter(u => u.id !== userToDelete.id);

    // Permanently purge document from Cloud Firestore registry and all store paths
    deleteUserFromFirestore(userToDelete.id, DEFAULT_STORE_ID).catch(err => {
      console.warn('Failed to delete user document from Firestore:', err);
    });

    if (onUpdateUsers) {
      onUpdateUsers(updatedUsers);
    }
    showToast(`User "${userToDelete.name}" has been permanently deleted`, 'info');
    setUserToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl sm:rounded-2xl max-w-2xl w-full p-3 sm:p-6 shadow-2xl space-y-3 sm:space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[95dvh] sm:max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 sm:pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 bg-blue-600 text-white rounded-lg sm:rounded-xl shadow-md shadow-blue-500/20">
              <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight">
                Shop Settings & Branding
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">
                Customize shop logo, receipts, currency, themes & backups
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Subtabs Selector */}
        <div className="no-scrollbar flex items-center gap-1 border-b border-slate-100 pb-2 shrink-0 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'profile'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Store Profile & Logo
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('branding')}
            className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'branding'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Themes & Print
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('backup')}
            className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'backup'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Backup & Restore
          </button>

          {fullData.currentUser?.role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setActiveSubTab('users')}
                className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
                  activeSubTab === 'users'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('password')}
                className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
                  activeSubTab === 'password'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Security & Password
              </button>
            </>
          )}
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto pr-1 flex-1">
          {activeSubTab === 'profile' && (
            <form onSubmit={handleSave} className="space-y-3 sm:space-y-4">
              {/* Logo Management Grid: Main Shop Logo & Dedicated Invoice Logo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] sm:text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                    Branding & Logo Management
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5">
                  {/* Card 1: Main Shop Logo */}
                  <div className="p-2.5 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] sm:text-xs font-bold text-slate-800">
                          1. Main Shop Logo
                        </label>
                        <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[9px] font-black uppercase">
                          App Header
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {formData.shopLogo ? (
                          <div className="relative group w-16 h-16 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-1 shrink-0 border border-slate-200">
                            <img
                              src={formData.shopLogo}
                              alt="Shop Logo"
                              className="w-full h-full object-contain rounded-full"
                            />
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              className="absolute max-lg:bottom-0.5 max-lg:right-0.5 max-lg:w-6 max-lg:h-6 max-lg:rounded-full max-lg:bg-slate-900/80 max-lg:opacity-100 lg:inset-0 lg:bg-slate-900/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer lg:rounded-full"
                              title="Remove Shop Logo"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-rose-400" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0">
                            <Store className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                            <span className="text-[9px] font-bold mt-0.5">No Logo</span>
                          </div>
                        )}

                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-[11px] font-bold text-blue-600 hover:bg-blue-50/50 transition cursor-pointer shadow-2xs h-7.5">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{formData.shopLogo ? 'Change' : 'Upload'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => setCameraModalConfig({ isOpen: true, target: 'shop' })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition cursor-pointer shadow-2xs h-7.5"
                              title="Camera Snap"
                            >
                              <Camera className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Camera</span>
                            </button>

                            {formData.shopLogo && (
                              <button
                                type="button"
                                onClick={handleRemoveLogo}
                                className="h-7.5 w-7.5 flex items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Remove Logo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            PNG, JPG or Camera (under 2MB).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Dedicated Invoice Logo */}
                  <div className="p-2.5 sm:p-4 bg-indigo-50/40 rounded-xl sm:rounded-2xl border-2 border-indigo-200/90 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1 gap-1">
                        <label className="block text-[11px] sm:text-xs font-bold text-slate-800 flex items-center gap-1 truncate">
                          <Receipt className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">2. Invoice Logo</span>
                        </label>
                        {formData.invoiceLogo ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold shrink-0">
                            Shop Logo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {formData.invoiceLogo ? (
                          <div className="relative group w-16 h-16 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-1 shrink-0 border border-indigo-200">
                            <img
                              src={formData.invoiceLogo}
                              alt="Dedicated Invoice Logo"
                              className="w-full h-full object-contain rounded-full"
                            />
                            <button
                              type="button"
                              onClick={handleRemoveInvoiceLogo}
                              className="absolute max-lg:bottom-0.5 max-lg:right-0.5 max-lg:w-6 max-lg:h-6 max-lg:rounded-full max-lg:bg-slate-900/80 max-lg:opacity-100 lg:inset-0 lg:bg-slate-900/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer lg:rounded-full"
                              title="Remove Invoice Logo"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-rose-400" />
                            </button>
                          </div>
                        ) : formData.shopLogo ? (
                          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-indigo-300 bg-white p-0.5 flex flex-col items-center justify-center text-slate-400 shrink-0" title="Using main shop logo">
                            <img
                              src={formData.shopLogo}
                              alt="Default Shop Logo"
                              className="w-full h-full object-cover rounded-full opacity-60"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-indigo-300 bg-white flex flex-col items-center justify-center text-indigo-400 shrink-0">
                            <Receipt className="w-6 h-6 sm:w-8 sm:h-8" />
                            <span className="text-[9px] font-bold mt-0.5">No Logo</span>
                          </div>
                        )}

                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-xs h-7.5">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{formData.invoiceLogo ? 'Change' : 'Upload'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleInvoiceLogoUpload}
                                className="hidden"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => setCameraModalConfig({ isOpen: true, target: 'invoice' })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 transition cursor-pointer shadow-2xs h-7.5"
                              title="Capture with camera"
                            >
                              <Camera className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Camera</span>
                            </button>

                            {formData.invoiceLogo && (
                              <button
                                type="button"
                                onClick={handleRemoveInvoiceLogo}
                                className="h-7.5 w-7.5 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                title="Reset to Default Shop Logo"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight">
                            {formData.invoiceLogo 
                              ? 'Prints on bills & thermal receipts.' 
                              : 'Uses main shop logo if empty.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shop Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Shop / Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.shopName}
                    onChange={e => setFormData({ ...formData, shopName: e.target.value })}
                    className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={formData.tagline}
                    onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                    placeholder="e.g. Sales, Service & Accessories"
                    className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Shop Phone / WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Currency Symbol *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs tabular-nums font-bold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Complete Shop Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Low Stock Warning Threshold (Units)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="Qty"
                    value={(formData.lowStockThreshold as any) ?? ''}
                    onChange={e => setFormData({ ...formData, lowStockThreshold: (e.target.value === '' ? '' : parseInt(e.target.value, 10) || 1) as any })}
                    className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                {/* Custom Invoice Bottom Note & Return Policy */}
                <div className="sm:col-span-2 p-2.5 sm:p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-xl sm:rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] sm:text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-600" />
                      Invoice Note &amp; Warranty Policy
                    </label>
                    <span className="text-[9.5px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">
                      Prints on Bills
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">
                        Invoice Bottom Note
                      </label>
                      <textarea
                        rows={2}
                        value={formData.receiptFooter || ''}
                        onChange={e => setFormData({ ...formData, receiptFooter: e.target.value })}
                        placeholder="e.g. Thank you for shopping with us!"
                        className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">
                        Warranty / Return Policy
                      </label>
                      <textarea
                        rows={2}
                        value={formData.returnPolicy || ''}
                        onChange={e => setFormData({ ...formData, returnPolicy: e.target.value })}
                        placeholder="e.g. 7 Days checking warranty."
                        className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Login Page Customization Section */}
              <div className="p-2.5 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2.5">
                <h4 className="text-[11px] sm:text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-indigo-600" />
                  Login Page Customization
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Login Brand Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.loginPageName}
                      onChange={e => setFormData({ ...formData, loginPageName: e.target.value })}
                      placeholder="e.g. FMZ SHOP POS"
                      className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2.5">
                    {formData.loginPageLogo ? (
                      <div className="relative group w-12 h-12 rounded-xl border border-slate-300 bg-white p-1 flex items-center justify-center shadow-xs overflow-hidden shrink-0">
                        <img
                          src={formData.loginPageLogo}
                          alt="Login Page Logo"
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, loginPageLogo: '' }));
                            showToast('Login page logo removed', 'info');
                          }}
                          className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer"
                          title="Remove Logo"
                        >
                          <Trash2 className="w-4 h-4 text-rose-300" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0">
                        <Store className="w-5 h-5" />
                      </div>
                    )}

                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-[11px] font-bold text-blue-600 hover:bg-blue-50/50 transition cursor-pointer shadow-2xs h-8">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{formData.loginPageLogo ? 'Change Login Logo' : 'Upload Login Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 2 * 1024 * 1024) {
                            showToast('Logo file size must be under 2MB', 'error');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = ev => {
                            const result = ev.target?.result as string;
                            setFormData(prev => ({
                              ...prev,
                              loginPageLogo: result,
                            }));
                            showToast('Login page logo uploaded successfully', 'success');
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  className="h-8.5 sm:h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg sm:rounded-xl text-xs font-extrabold shadow-md shadow-blue-600/25 transition cursor-pointer"
                >
                  Save Store Profile
                </button>
              </div>
            </form>
          )}

          {activeSubTab === 'branding' && (
            <div className="space-y-3 sm:space-y-4">
              {/* Theme Picker */}
              <div className="space-y-2">
                <label className="block text-[11px] sm:text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                  Color Theme Preset
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THEME_OPTIONS.map(theme => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleSelectTheme(theme.id)}
                      className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl border-2 flex items-center gap-2 transition cursor-pointer text-left ${
                        formData.theme === theme.id
                          ? `${theme.border} bg-slate-50 font-bold shadow-xs`
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full shrink-0 ${theme.accent} shadow-xs flex items-center justify-center text-white`}>
                        {formData.theme === theme.id && <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[3]" />}
                      </div>
                      <span className="text-[11px] sm:text-xs text-slate-800 truncate">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dedicated Invoice Logo Quick Setting */}
              <div className="p-2.5 sm:p-4 bg-indigo-50/50 rounded-xl sm:rounded-2xl border-2 border-indigo-200/80 space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
                    <span>Invoice & Receipt Logo</span>
                  </label>
                  {formData.invoiceLogo ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> Custom
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[9.5px] font-bold shrink-0">
                      Shop Logo
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 sm:gap-4">
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border border-indigo-200 bg-white p-0.5 flex items-center justify-center shrink-0 shadow-xs">
                    {formData.invoiceLogo ? (
                      <img
                        src={formData.invoiceLogo}
                        alt="Invoice Logo"
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : formData.shopLogo ? (
                      <img
                        src={formData.shopLogo}
                        alt="Fallback Shop Logo"
                        className="w-full h-full object-cover rounded-full opacity-60"
                      />
                    ) : (
                      <Receipt className="w-5 h-5 sm:w-7 sm:h-7 text-indigo-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="inline-flex items-center gap-1 h-7.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-xs">
                        <Upload className="w-3 h-3" />
                        <span>{formData.invoiceLogo ? 'Change Logo' : 'Upload Logo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleInvoiceLogoUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setCameraModalConfig({ isOpen: true, target: 'invoice' })}
                        className="inline-flex items-center gap-1 h-7.5 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 transition cursor-pointer shadow-2xs"
                      >
                        <Camera className="w-3 h-3 text-indigo-600" />
                        <span>Camera</span>
                      </button>

                      {formData.invoiceLogo && (
                        <button
                          type="button"
                          onClick={handleRemoveInvoiceLogo}
                          className="h-7.5 px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-[10.5px] font-semibold transition cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 leading-snug">
                      Custom logo printed on customer invoices & thermal receipts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Receipt Footer / Return Policy */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="block text-[11px] sm:text-xs font-bold text-slate-800">
                  Return & Warranty Policy (Receipt Footer)
                </label>
                <textarea
                  rows={2}
                  value={formData.returnPolicy}
                  onChange={e => setFormData({ ...formData, returnPolicy: e.target.value })}
                  placeholder="e.g. 7 Days checking warranty. Original invoice required for any claims."
                  className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] sm:text-xs font-bold text-slate-800">
                  Receipt Bottom Tagline
                </label>
                <input
                  type="text"
                  value={formData.receiptFooter}
                  onChange={e => setFormData({ ...formData, receiptFooter: e.target.value })}
                  placeholder="Thank you for shopping with us!"
                  className="compact-mobile-input w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={e => handleSave(e as any)}
                  className="h-8.5 sm:h-9 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg sm:rounded-xl text-xs font-extrabold shadow-md shadow-blue-600/20 transition cursor-pointer"
                >
                  Save Theme & Layout
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'backup' && (
            <div className="space-y-3">
              <div className="p-2.5 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-xl sm:rounded-2xl flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-[11px] sm:text-xs text-slate-700 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h4 className="font-bold text-slate-900">Firebase Cloud Database</h4>
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider">
                      Active
                    </span>
                  </div>
                  <p className="text-slate-600 font-medium leading-snug">
                    Project: <strong className="tabular-nums text-emerald-700">{firebaseConfig.projectId || 'fmz-shop-pos'}</strong> (Store: <strong className="tabular-nums text-emerald-700">stores/{currentStoreId || 'main_store'}</strong>). Data syncs automatically in your private store.
                  </p>
                </div>
              </div>

              {/* Photo & Free Cloud Storage Meter */}
              {(() => {
                const storageStats = calculateStorageUsageStats(fullData);
                const totalMb = storageStats.totalBytes / (1024 * 1024);
                const photoMb = storageStats.photoBytes / (1024 * 1024);
                const textMb = storageStats.textBytes / (1024 * 1024);
                const remainingMb = storageStats.remainingBytes / (1024 * 1024);
                const limitMb = storageStats.firestoreFreeLimitBytes / (1024 * 1024);
                const pct = Math.min(100, Math.max(0.5, storageStats.usedPercent));

                return (
                  <div className="p-2.5 sm:p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl sm:rounded-2xl space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div>
                        <h4 className="font-black text-indigo-950 text-[11px] sm:text-xs flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                          Cloud Storage Status
                        </h4>
                        <p className="text-[9.5px] sm:text-[10px] text-indigo-800/80">
                          1,024 MB (1 GiB) free tier for photos &amp; entries
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9.5px] font-black tabular-nums">
                        {remainingMb >= 1024
                          ? `${(remainingMb / 1024).toFixed(2)} GB Left`
                          : `${remainingMb.toFixed(1)} MB Left`}
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">
                        <span>Total Used</span>
                        <span className="tabular-nums">
                          {totalMb.toFixed(2)} / {limitMb.toLocaleString()} MB ({storageStats.usedPercent.toFixed(2)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-white border border-indigo-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-[10.5px] sm:text-[11px]">
                      <div className="bg-white p-2 rounded-lg sm:rounded-xl border border-indigo-100">
                        <span className="text-[9.5px] text-slate-400 block font-semibold">Saved Photos</span>
                        <span className="font-black text-slate-900 tabular-nums">
                          {storageStats.photoCount} ({photoMb.toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg sm:rounded-xl border border-indigo-100">
                        <span className="text-[9.5px] text-slate-400 block font-semibold">Entries &amp; Text</span>
                        <span className="font-black text-slate-900 tabular-nums">{textMb.toFixed(2)} MB</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg sm:rounded-xl border border-indigo-100">
                        <span className="text-[9.5px] text-slate-400 block font-semibold">Free Space Left</span>
                        <span className="font-black text-emerald-700 tabular-nums">{remainingMb.toFixed(1)} MB</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg sm:rounded-xl border border-indigo-100">
                        <span className="text-[9.5px] text-slate-400 block font-semibold">Est. Photos Left</span>
                        <span className="font-black text-indigo-700 tabular-nums">
                          ~{storageStats.estimatedRemainingPhotos.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <p className="text-[9.5px] text-slate-500 leading-snug">
                      Inventory ({storageStats.photoBreakdown.inventory}) • Khata ({storageStats.photoBreakdown.khata}) • Expenses ({storageStats.photoBreakdown.expenses}) • Purchases ({storageStats.photoBreakdown.purchases}) • Logos ({storageStats.photoBreakdown.logos})
                    </p>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                {/* Export Backup */}
                <div className="p-2.5 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Export Backup</h4>
                      <p className="text-[10px] text-slate-400">Download database JSON file</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExportData(false)}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg sm:rounded-xl transition cursor-pointer shadow-sm shadow-emerald-600/20"
                  >
                    Download JSON Backup
                  </button>
                </div>

                {/* Import / Restore Backup */}
                <div className="p-2.5 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Restore Backup</h4>
                      <p className="text-[10px] text-slate-400">Upload existing JSON file</p>
                    </div>
                  </div>

                  <label className="block w-full text-center py-2 px-3 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-lg sm:rounded-xl transition cursor-pointer shadow-2xs">
                    <span>Select JSON File</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Automatic 7-Day Safety Backups */}
              <div className="p-2.5 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">
                        Restore from automatic backup
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Automatic daily safety snapshots saved locally (last 7 days)
                      </p>
                    </div>
                  </div>
                </div>

                {loadingAutoBackups ? (
                  <p className="text-[11px] text-slate-500 font-semibold py-1.5">
                    Loading automatic snapshots...
                  </p>
                ) : automaticBackups.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-1.5">
                    No automatic daily backups recorded yet. Snapshots are created automatically as you work.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {automaticBackups.map((snap) => (
                      <div
                        key={snap.id}
                        className="p-2 sm:p-2.5 bg-white rounded-lg sm:rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800 text-[11px] sm:text-xs tabular-nums">
                              {snap.date}
                            </span>
                            <span className="text-[9.5px] text-slate-400 tabular-nums">
                              Saved {new Date(snap.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[9.5px] text-slate-500 tabular-nums truncate">
                            {snap.data.inventory?.length || 0} products • {snap.data.sales?.length || 0} sales • {snap.data.khata?.length || 0} khata • {snap.data.expenses?.length || 0} expenses
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => downloadJsonBackup(snap.data, `auto_backup_${snap.date}_`)}
                            className="inline-flex items-center gap-1 h-7 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md sm:rounded-lg text-[10.5px] font-bold transition cursor-pointer"
                            title="Download this automatic backup as JSON"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectAutomaticBackup(snap)}
                            className="inline-flex items-center gap-1 h-7 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md sm:rounded-lg text-[10.5px] font-bold transition cursor-pointer shadow-xs"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Data Recovery (Respects Deleted Tombstones) */}
              {onRecoverMissingData && (
                <div className="p-2.5 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Database className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">
                        Recover Missing Records (Manual Scan)
                      </h4>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Scans local caches & Cloud Firestore for unmerged records while respecting deleted tombstones.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleManualRecoverMissingData}
                    disabled={isRecoveringData}
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg sm:rounded-xl text-[11px] font-bold transition cursor-pointer shrink-0 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRecoveringData ? 'animate-spin' : ''}`} />
                    <span>{isRecoveringData ? 'Scanning...' : 'Recover Missing Data'}</span>
                  </button>
                </div>
              )}

            </div>
          )}

          {activeSubTab === 'users' && (
            <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
                {/* Add Salesman Form */}
                <div className="bg-slate-50/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                      <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs">Add New Salesman Account</h4>
                      <p className="text-[10px] text-slate-400">Create login credentials for shop staff</p>
                    </div>
                  </div>

                  <form onSubmit={handleAddSalesman} className="space-y-2.5 pt-1">
                    <div>
                      <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        Salesman Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Hammad Raza"
                        value={salesmanName}
                        onChange={e => setSalesmanName(e.target.value)}
                        className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="email"
                          required
                          placeholder="e.g. hammad@shop.com"
                          value={salesmanEmail}
                          onChange={e => setSalesmanEmail(e.target.value)}
                          className="compact-mobile-input w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        Password (Min 6 chars) *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="password"
                          required
                          placeholder="••••••"
                          value={salesmanPassword}
                          onChange={e => setSalesmanPassword(e.target.value)}
                          className="compact-mobile-input w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg sm:rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Create Salesman Account</span>
                    </button>
                  </form>
                </div>

                {/* Registered Users List */}
                <div className="bg-slate-50/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 flex flex-col h-full min-h-[160px] sm:min-h-[280px]">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs">Registered Shop Accounts</h4>
                      <p className="text-[10px] text-slate-400">Total active users in system</p>
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[200px] sm:max-h-[220px] pr-1 space-y-1.5 flex-1">
                    {storeScopedUsers.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-[11px] font-bold">
                        No secondary users registered. Add a salesman on the left.
                      </div>
                    ) : (
                      storeScopedUsers.map(usr => (
                        <div
                          key={usr.id}
                          className="p-2 sm:p-3 bg-white border border-slate-200 rounded-lg sm:rounded-xl flex items-center justify-between shadow-3xs gap-2"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-800 text-[11.5px] sm:text-xs truncate">{usr.name}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider ${
                                  usr.role === 'admin'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200/55'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200/55'
                                }`}
                              >
                                {usr.role}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-semibold tabular-nums truncate">{usr.email}</p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {usr.role === 'salesman' && (
                              <button
                                type="button"
                                onClick={() => handleOpenChangeSalesmanPassword(usr)}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-md sm:rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition cursor-pointer"
                                title="Change Salesman Password"
                              >
                                <Key className="w-3 h-3 text-indigo-600" />
                                <span className="hidden sm:inline">Change Password</span>
                              </button>
                            )}

                            {usr.id !== fullData.currentUser?.id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(usr.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md sm:rounded-lg transition cursor-pointer"
                                title="Delete User"
                              >
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'password' && (
            <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-200">
              {/* Authenticator 2FA Security Section */}
              <div className="bg-gradient-to-r from-indigo-50/90 to-purple-50/90 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-indigo-200/90 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 sm:p-2 bg-indigo-600 text-white rounded-lg sm:rounded-xl shadow-xs shrink-0">
                      <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">Authenticator 2FA Security</h4>
                      <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium truncate">
                        Google Authenticator, Authy, or Microsoft TOTP
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center shrink-0">
                    {currentAdminUser?.is2faEnabled ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9.5px] font-black rounded-full uppercase tracking-wider flex items-center gap-1 border border-emerald-200">
                        <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9.5px] font-bold rounded-full uppercase tracking-wider border border-amber-200">
                        Setup
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-indigo-100">
                  <div className="text-[11px] sm:text-xs text-slate-600 space-y-0.5">
                    <p className="font-semibold text-slate-800">
                      Admin: <span className="tabular-nums font-bold text-indigo-900">{currentAdminUser?.email || 'admin@fmzpos.com'}</span>
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-slate-500">
                      {currentAdminUser?.is2faEnabled 
                        ? '2FA is protecting your login. Refresh QR code anytime.'
                        : 'Generate a QR Code & Secret Key for Google Authenticator.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsTotpSetupOpen(true)}
                    className="h-8 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg sm:rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>{currentAdminUser?.is2faEnabled ? 'Refresh / Reset 2FA Key' : 'Setup 2FA Now'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
                {/* Change Master Admin Password Form */}
                <div className="bg-slate-50/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                      <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs">Change Master Admin Password</h4>
                      <p className="text-[10px] text-slate-400">Update terminal main gateway password</p>
                    </div>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        Current Password *
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="Enter current password"
                        value={oldPassword}
                        onChange={e => setOldPassword(e.target.value)}
                        className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        New Password (Min 6 chars) *
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="••••••"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        Confirm New Password *
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="••••••"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg sm:rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Update Administrator Password</span>
                    </button>
                  </form>
                </div>

                {/* Change Salesman Password Section */}
                <div className="bg-slate-50/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                      <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs">Change Salesman Password (Staff)</h4>
                      <p className="text-[10px] text-slate-400">Update password for any registered salesman</p>
                    </div>
                  </div>

                  {storeScopedUsers.filter(u => u.role === 'salesman').length === 0 ? (
                    <div className="text-center py-6 bg-white border border-slate-200/70 rounded-xl p-3 space-y-1.5">
                      <Key className="w-6 h-6 text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-500 font-bold">No Salesman registered yet</p>
                      <p className="text-[10px] text-slate-400">
                        Create a salesman account from "User Management" first.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleUpdateSalesmanPasswordFromTab} className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Select Salesman Staff *
                        </label>
                        <select
                          value={selectedSalesmanIdForTab}
                          onChange={e => setSelectedSalesmanIdForTab(e.target.value)}
                          required
                          className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- Choose Salesman Account --</option>
                          {storeScopedUsers
                            .filter(u => u.role === 'salesman')
                            .map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.email})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          New Salesman Password (Min 6 chars) *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="••••••"
                          value={tabSalesmanNewPass}
                          onChange={e => setTabSalesmanNewPass(e.target.value)}
                          className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[9.5px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Confirm New Password *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="••••••"
                          value={tabSalesmanConfirmPass}
                          onChange={e => setTabSalesmanConfirmPass(e.target.value)}
                          className="compact-mobile-input w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg sm:rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-amber-600/10 cursor-pointer"
                      >
                        <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Update Salesman Password</span>
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Camera Capture Modal for Shop or Invoice Logo */}
      <CameraCaptureModal
        isOpen={cameraModalConfig.isOpen}
        onClose={() => setCameraModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={cameraModalConfig.target === 'invoice' ? 'Capture Dedicated Invoice Logo with Camera' : 'Capture Shop Logo with Camera'}
        onCapture={dataUrl => {
          if (cameraModalConfig.target === 'invoice') {
            setFormData(prev => ({
              ...prev,
              invoiceLogo: dataUrl,
            }));
            showToast('Dedicated invoice logo captured with camera!', 'success');
          } else {
            setFormData(prev => ({
              ...prev,
              shopLogo: dataUrl,
              logo: dataUrl,
            }));
            showToast('Shop logo captured with camera!', 'success');
          }
        }}
      />

      {/* Safe Pre-Restore Verification Modal */}
      {isRestoreConfirmOpen && pendingRestoreData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">
                    Validate & Confirm Database Restore
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Verify backup structure and create a safety backup before restoring
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRestoreConfirmOpen(false);
                  setPendingRestoreData(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Validation Success Banner */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">Backup file format validated successfully!</span>
                </div>
                <span className="text-[10px] tabular-nums px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded font-bold">
                  Format v{pendingRestoreSummary?.backupVersion || 1}
                </span>
              </div>

              {/* Summary of Incoming Data */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                  Backup Content Summary
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Inventory Items</span>
                    <span className="font-extrabold text-slate-900 tabular-nums text-sm">
                      {pendingRestoreSummary?.inventoryCount ?? 0}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Sales Invoices</span>
                    <span className="font-extrabold text-blue-600 tabular-nums text-sm">
                      {pendingRestoreSummary?.salesCount ?? 0}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Customer Khata</span>
                    <span className="font-extrabold text-purple-600 tabular-nums text-sm">
                      {pendingRestoreSummary?.khataCount ?? 0}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Expense Records</span>
                    <span className="font-extrabold text-rose-600 tabular-nums text-sm">
                      {pendingRestoreSummary?.expensesCount ?? 0}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Supplier Bills</span>
                    <span className="font-extrabold text-amber-600 tabular-nums text-sm">
                      {pendingRestoreSummary?.purchasesCount ?? 0}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Sales Returns</span>
                    <span className="font-extrabold text-indigo-600 tabular-nums text-sm">
                      {pendingRestoreSummary?.returnsCount ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Safety Backup Prompt */}
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-amber-900 text-xs">
                      Create a backup of current data before restoring?
                    </h4>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Restoring will replace your current active records with the backup file. To protect your work from accidental loss, we recommend downloading a safety backup of your current database first.
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={() => handleExportData(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-400 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-amber-700" />
                    <span>Download Safety Backup of Current Data</span>
                  </button>

                  {safetyBackupCreated && (
                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Saved!
                    </span>
                  )}
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmRestoreAgreement}
                  onChange={e => setConfirmRestoreAgreement(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-0.5"
                />
                <span className="text-slate-700 font-semibold leading-relaxed">
                  I confirm that I want to replace current active data with this backup. {safetyBackupCreated ? 'Safety backup was saved.' : 'I acknowledge that unsaved active data will be replaced.'}
                </span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsRestoreConfirmOpen(false);
                  setPendingRestoreData(null);
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!confirmRestoreAgreement}
                onClick={handleExecuteRestore}
                className={`px-5 py-2 text-white text-xs font-extrabold rounded-xl shadow-lg transition cursor-pointer ${
                  confirmRestoreAgreement
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25 active:scale-95'
                    : 'bg-slate-300 cursor-not-allowed shadow-none'
                }`}
              >
                Confirm & Restore Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Change Salesman Password */}
      {showSalesmanPassModal && salesmanForPasswordChange && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-xl">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Change Salesman Password</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">
                    Set a new password for {salesmanForPasswordChange.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSalesmanPassModal(false);
                  setSalesmanForPasswordChange(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl text-xs space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Staff Account</span>
              <p className="font-extrabold text-slate-800">{salesmanForPasswordChange.name}</p>
              <p className="text-[11px] tabular-nums text-slate-500">{salesmanForPasswordChange.email}</p>
            </div>

            <form onSubmit={handleUpdateSalesmanPassword} className="space-y-3 pt-1">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  New Password (Min 6 chars) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••"
                  minLength={6}
                  value={newSalesmanPassword}
                  onChange={e => setNewSalesmanPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-amber-500 rounded-xl text-xs font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••"
                  minLength={6}
                  value={confirmSalesmanPassword}
                  onChange={e => setConfirmSalesmanPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-amber-500 rounded-xl text-xs font-bold outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowSalesmanPassModal(false);
                    setSalesmanForPasswordChange(null);
                  }}
                  className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete User (Iframe Safe) */}
      {userToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 my-auto animate-in zoom-in-95 text-center">
            <div className="w-12 h-12 bg-rose-50 border border-rose-200 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Delete User Account</h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Are you sure you want to permanently delete user <strong className="text-slate-800 font-bold">"{userToDelete.name}"</strong> ({userToDelete.email})?
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-600/20 transition cursor-pointer"
              >
                Yes, Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOTP 2FA Setup / Refresh Modal */}
      <TotpSetupModal
        isOpen={isTotpSetupOpen}
        onClose={() => setIsTotpSetupOpen(false)}
        adminEmail={currentAdminUser?.email || 'admin@fmzpos.com'}
        existingSecret={undefined} // Generates a fresh key for reset/refresh
        onVerifySuccess={(newSecret) => {
          if (currentAdminUser) {
            const updatedAdmin: UserAccount = {
              ...currentAdminUser,
              totpSecret: newSecret,
              is2faEnabled: true,
            };
            saveUserToFirestore(updatedAdmin, DEFAULT_STORE_ID);
            if (onUpdateUsers && fullData.users) {
              const updatedUsers = fullData.users.map(u => u.id === updatedAdmin.id ? updatedAdmin : u);
              onUpdateUsers(updatedUsers);
            }
          }
          showToast('Authenticator 2FA key refreshed & locked in successfully!', 'success');
        }}
        title="Refresh / Reset Authenticator 2FA Key"
        description="Scanning the new QR Code will invalidate your previous key. Enter the 6-digit passcode from Google Authenticator to confirm."
      />
    </div>
  );
};

export default Settings;
