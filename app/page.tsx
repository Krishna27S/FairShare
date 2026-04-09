'use client';

import { AppProvider, useApp } from '@/lib/app-context';
import { LoginScreen } from '@/components/screens/login';
import { DashboardScreen } from '@/components/screens/dashboard';
import { GroupsScreen } from '@/components/screens/groups';
import { GroupDetailScreen } from '@/components/screens/group-detail';
import { AddExpenseScreen } from '@/components/screens/add-expense';
import { SettlementsScreen } from '@/components/screens/settlements';
import { ActivityScreen } from '@/components/screens/activity';
import { OrganizationScreen } from '@/components/screens/organization';
import { GeneralSettingsScreen } from '@/components/screens/general-settings';
import { SpendingAnalysisScreen } from '@/components/screens/spending-analysis';
import { Navigation } from '@/components/navigation';

const screens = {
  login: LoginScreen,
  dashboard: DashboardScreen,
  groups: GroupsScreen,
  'group-detail': GroupDetailScreen,
  'add-expense': AddExpenseScreen,
  settlements: SettlementsScreen,
  activity: ActivityScreen,
  organization: OrganizationScreen,
  'general-settings': GeneralSettingsScreen,
  'spending-analysis': SpendingAnalysisScreen,
} as const;

function AppContent() {
  const { screen, loading } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const ScreenComponent = screens[screen as keyof typeof screens];

  if (!ScreenComponent) {
    return <div className="p-6">Screen not found: {screen}</div>;
  }

  return (
    <>
      <main className="mx-auto max-w-lg bg-background min-h-screen">
        <ScreenComponent />
      </main>
      <Navigation />
    </>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
