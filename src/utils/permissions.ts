import { UserRole } from '../types';

export interface RolePermissions {
  canCreateSale: boolean;
  canProcessReturns: boolean;
  canDeleteSale: boolean;
  canViewInventory: boolean;
  canEditInventory: boolean;
  canDeleteInventory: boolean;
  canManagePurchases: boolean;
  canReversePurchase: boolean;
  canDeletePurchase: boolean;
  canViewCostAndProfit: boolean;
  canManageKhata: boolean;
  canDeleteKhata: boolean;
  canManageExpenses: boolean;
  canDeleteExpenses: boolean;
  canManageDailyClosing: boolean;
  canDeleteDailyClosing: boolean;
  canChangeSettings: boolean;
  canRestoreBackup: boolean;
  canExportBackup: boolean;
  canViewAuditLogs: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canCreateSale: true,
    canProcessReturns: true,
    canDeleteSale: true,
    canViewInventory: true,
    canEditInventory: true,
    canDeleteInventory: true,
    canManagePurchases: true,
    canReversePurchase: true,
    canDeletePurchase: true,
    canViewCostAndProfit: true,
    canManageKhata: true,
    canDeleteKhata: true,
    canManageExpenses: true,
    canDeleteExpenses: true,
    canManageDailyClosing: true,
    canDeleteDailyClosing: true,
    canChangeSettings: true,
    canRestoreBackup: true,
    canExportBackup: true,
    canViewAuditLogs: true,
  },
  salesman: {
    canCreateSale: true,
    canProcessReturns: false, // Sales return and refund requires admin authority
    canDeleteSale: false,     // Salesman cannot delete sales
    canViewInventory: true,   // View retail items and IMEIs
    canEditInventory: false,  // Cannot edit product cost, pricing or barcode
    canDeleteInventory: false,// Cannot delete or archive products
    canManagePurchases: false,// Purchases & supplier bills are admin only
    canReversePurchase: false,// Purchase reversal is admin only
    canDeletePurchase: false, // Purchase deletion is admin only
    canViewCostAndProfit: false, // Sensitive profit and cost price hidden
    canManageKhata: true,     // Can view khata, assign customer to sale, record payment
    canDeleteKhata: false,    // Cannot delete customer or alter historical ledger
    canManageExpenses: false, // Financial expense creation restricted to admin
    canDeleteExpenses: false, // Cannot delete expenses
    canManageDailyClosing: false, // Daily closing requires admin authority
    canDeleteDailyClosing: false, // Cannot delete historical closings
    canChangeSettings: false, // System settings locked
    canRestoreBackup: false,  // Restoring backup locked
    canExportBackup: true,    // Exporting backup permitted for safety
    canViewAuditLogs: false,  // Audit logs view restricted to admin
  },
};

export function hasPermission(role: UserRole = 'admin', permission: keyof RolePermissions): boolean {
  const permSet = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.admin;
  return !!permSet[permission];
}

export function enforcePermission(role: UserRole = 'admin', permission: keyof RolePermissions, actionName: string): boolean {
  if (!hasPermission(role, permission)) {
    console.warn(`[Permission Denied] Role "${role}" attempted unauthorized action: ${actionName}`);
    return false;
  }
  return true;
}
