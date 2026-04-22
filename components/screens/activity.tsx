'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase, ActivityLog } from '@/lib/supabase';
import { TrendingUp, Wallet, Users, LogOut, Settings, Bell, LogIn, Clock, Trash2 } from 'lucide-react';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'expense_added':
      return <TrendingUp size={24} className="text-orange-500" />;
    case 'payment_recorded':
      return <Wallet size={24} className="text-green-500" />;
    case 'member_joined':
      return <Users size={24} className="text-blue-500" />;
    case 'member_left':
      return <LogOut size={24} className="text-red-500" />;
    case 'group_created':
      return <LogIn size={24} className="text-purple-500" />;
    case 'group_deleted':
      return <Trash2 size={24} className="text-red-600" />;
    default:
      return <Clock size={24} className="text-muted-foreground" />;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'expense_added':
      return 'bg-orange-500/10';
    case 'payment_recorded':
      return 'bg-green-500/10';
    case 'member_joined':
      return 'bg-blue-500/10';
    case 'member_left':
      return 'bg-red-500/10';
    case 'group_created':
      return 'bg-purple-500/10';
    case 'group_deleted':
      return 'bg-red-600/10';
    default:
      return 'bg-muted';
  }
};

const formatTimeAgo = (date: string) => {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return then.toLocaleDateString();
};

export function ActivityScreen() {
  const { currentUser, setScreen } = useApp();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'activity' | 'profile'>('activity');
  const [signingOut, setSigningOut] = useState(false);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [memberSince, setMemberSince] = useState<string>('');

  const loadActivities = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      // Load activity logs for current user's groups with user details
      const { data: userGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', currentUser.id);

      const groupIds = userGroups?.map((g) => g.group_id) || [];
      setGroupCount(groupIds.length);

      // Load member since date
      const { data: userData } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', currentUser.id)
        .single();

      if (userData?.created_at) {
        const date = new Date(userData.created_at);
        setMemberSince(date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }));
      }

      if (groupIds.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      const { data: activityData, error } = await supabase
        .from('activity_log')
        .select(
          `
          id,
          activity_type,
          description,
          created_at,
          user_id,
          group_id,
          metadata,
          user:users!activity_log_user_id_fkey(id, full_name, email)
        `
        )
        .in('group_id', groupIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setActivities(activityData || []);
    } catch (error) {
      console.error('[v0] Error loading activities:', error);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) {
      loadActivities();
    }
  }, [currentUser?.id, loadActivities]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { signOut } = await import('@/lib/auth-utils');
      await signOut();
      setScreen('login');
    } catch (error) {
      console.error('[v0] Error signing out:', error);
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-24">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading activity...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Tabs */}
      <div className="flex gap-2 p-4 bg-card border-b border-border sticky top-0 z-10">
        <button
          onClick={() => setSelectedTab('activity')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition ${
            selectedTab === 'activity'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Activity
        </button>
        <button
          onClick={() => setSelectedTab('profile')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition ${
            selectedTab === 'profile'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Profile
        </button>
      </div>

      {selectedTab === 'activity' ? (
        <div className="p-6">
          <h2 className="text-2xl font-bold text-foreground mb-6">Recent Activity</h2>

          {activities.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No activities yet</p>
              <p className="text-sm text-muted-foreground mt-2">Start by creating expenses or inviting members</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`${getActivityColor(activity.activity_type)} rounded-lg p-4 border border-border flex gap-4`}
                >
                  <div className="flex-shrink-0 mt-0.5">{getActivityIcon(activity.activity_type)}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{activity.description}</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      {formatTimeAgo(activity.created_at)}
                    </p>
                    {activity.user && (
                      <p className="text-muted-foreground text-xs mt-2">
                        by {activity.user.full_name || activity.user.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-6">
          {/* Profile Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-3xl font-bold text-primary-foreground">
                  {currentUser?.fullName?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-foreground">
                  {currentUser?.fullName || 'User'}
                </h2>
                <p className="text-muted-foreground text-sm">{currentUser?.email}</p>
              </div>
            </div>

            {/* Profile Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Member Since</p>
                <p className="font-bold text-foreground">
                  {memberSince || 'Recently'}
                </p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Total Groups</p>
                <p className="font-bold text-foreground">{groupCount !== null ? groupCount : '--'}</p>
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-4">Preferences</h3>

          <div className="space-y-3 mb-8">
            <button
              onClick={() => setScreen('general-settings')}
              className="w-full bg-card rounded-lg p-4 border border-border hover:border-primary transition text-left"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-foreground text-sm">General Settings</h4>
                  <p className="text-muted-foreground text-xs">Budget, spending analysis & more</p>
                </div>
              </div>
            </button>

            <button className="w-full bg-card rounded-lg p-4 border border-border hover:border-primary transition text-left">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-foreground text-sm">Notifications</h4>
                  <p className="text-muted-foreground text-xs">Manage email and push notifications</p>
                </div>
              </div>
            </button>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full bg-destructive/20 text-destructive font-bold py-3 px-4 rounded-lg hover:bg-destructive/30 transition disabled:opacity-50"
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
