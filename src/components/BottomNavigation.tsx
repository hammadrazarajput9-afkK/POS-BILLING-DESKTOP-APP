import React from 'react';
import {
  ShoppingCart,
  Boxes,
  BookOpen,
  Receipt,
  Menu,
  Calculator,
  LayoutDashboard
} from 'lucide-react';
import { UserRole } from '../types';

interface BottomNavigationProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenMenu: () => void;
  currentRole?: UserRole;
  cartItemCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onSelectTab,
  onOpenMenu,
  currentRole = 'admin',
  cartItemCount = 0,
}) => {
  const isSalesman = currentRole === 'salesman';

  const navButtons = [
    ...(isSalesman
      ? []
      : [
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
          },
        ]),
    {
      id: 'pos',
      label: 'POS Sale',
      icon: ShoppingCart,
      badge: cartItemCount > 0 ? cartItemCount : undefined,
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Boxes,
    },
    {
      id: 'khata',
      label: 'Khata',
      icon: BookOpen,
    },
    ...(isSalesman
      ? [
          {
            id: 'expenses',
            label: 'Expense',
            icon: Receipt,
          },
        ]
      : []),
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navButtons.map(btn => {
          const Icon = btn.icon;
          const isActive = activeTab === btn.id;

          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => onSelectTab(btn.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[56px] min-h-[44px] ${
                isActive
                  ? 'text-blue-600 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 text-blue-600' : 'text-slate-500'
                  }`}
                />
                {btn.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 bg-rose-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                    {btn.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight ${
                  isActive ? 'font-black text-blue-600' : 'font-semibold'
                }`}
              >
                {btn.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-6 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          );
        })}

        {/* More Menu Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-500 hover:text-slate-800 font-medium transition cursor-pointer min-w-[56px] min-h-[44px]"
        >
          <Menu className="w-5 h-5 text-slate-500" />
          <span className="text-[10px] mt-0.5 font-semibold">More</span>
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation;
