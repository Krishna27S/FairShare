'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChange, getCurrentUser, getUserProfile } from './auth-utils';
import { supabase } from './supabase';

export type UserRole = 'individual' | 'organisation';

type AuthUser = {
  id: string;
  email: string;
  fullName?: string;
  role?: UserRole;
  monthlyBudget?: number;
  notificationsEnabled?: boolean;
};

type AppContextType = {
  currentUser: AuthUser | null;
  userProfile: any | null;
  loading: boolean;
  screen: string;
  setScreen: (screen: string) => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  selectedOrgId: string | null;
  setSelectedOrgId: (id: string | null) => void;
  userRole: UserRole | null;
  refreshUserProfile: () => Promise<void>;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('login');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const refreshUserProfile = async () => {
    if (!currentUser) return;
    try {
      const profile = await getUserProfile(currentUser.id);
      setUserProfile(profile);
    } catch (error) {
      console.error('[v0] Error fetching user profile:', error);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const user = await getCurrentUser();
      if (user) {
        const profile = await getUserProfile(user.id);
        setCurrentUser({
          id: user.id,
          email: user.email || '',
          fullName: user.user_metadata?.full_name,
          role: profile?.role || 'individual',
          monthlyBudget: profile?.monthly_budget,
          notificationsEnabled: profile?.notifications_enabled,
        });
        setUserProfile(profile);
        setScreen('dashboard');
      }
      setLoading(false);
    };

    checkUser();

    const subscription = onAuthStateChange(async (user) => {
      if (user) {
        const profile = await getUserProfile(user.id);
        setCurrentUser({
          id: user.id,
          email: user.email || '',
          fullName: user.user_metadata?.full_name,
          role: profile?.role || 'individual',
          monthlyBudget: profile?.monthly_budget,
          notificationsEnabled: profile?.notifications_enabled,
        });
        setUserProfile(profile);
        setScreen('dashboard');
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setScreen('login');
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        screen,
        setScreen,
        selectedGroupId,
        setSelectedGroupId,
        selectedOrgId,
        setSelectedOrgId,
        userRole: currentUser?.role || null,
        refreshUserProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
