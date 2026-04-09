'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase, Expense, ExpenseSplit, GroupMember } from '@/lib/supabase';
import { realtimeManager, SubscriptionHandler } from '@/lib/realtime-utils';
import { parseError, logError } from '@/lib/error-handler';
import { deleteGroup } from '@/lib/member-utils';
import { toastManager } from '@/lib/toast';
import { ChevronLeft, BarChart3, Plus, AlertCircle } from 'lucide-react';

function getFirstName(name?: string | null, email?: string | null) {
  const fullName = (name || '').trim();
  if (fullName) return fullName.split(/\s+/)[0];
  const safeEmail = (email || '').trim();
  if (!safeEmail) return 'Member';
  return safeEmail.split('@')[0];
}

export function GroupDetailScreen() {
  const { currentUser, selectedGroupId, setScreen } = useApp();
  const [groupName, setGroupName] = useState('');
  const [tab, setTab] = useState<'balances' | 'expenses'>('balances');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [isGroupCreator, setIsGroupCreator] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedGroupId) return;

    try {
      setError('');

      // Load group
      const { data: groupData } = await supabase
        .from('groups')
        .select('id, name, created_by')
        .eq('id', selectedGroupId)
        .single();

      setGroupName(groupData?.name || '');
      setIsGroupCreator(groupData?.created_by === currentUser?.id);

      // Load members
      const { data: membersData } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', selectedGroupId);

      setMembers(membersData || []);

      const { data: profileRows, error: profileError } = await supabase.rpc(
        'get_group_member_profiles',
        { target_group_id: selectedGroupId }
      );
      if (profileError) throw profileError;

      const namesMap: Record<string, string> = {};
      (profileRows || []).forEach((row: any) => {
        namesMap[row.user_id] = getFirstName(row.full_name, row.email);
      });
      setMemberNames(namesMap);

      // Load expenses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('*')
        .eq('group_id', selectedGroupId)
        .order('created_at', { ascending: false });

      setExpenses(expensesData || []);

      // Calculate balances
      const { data: splits } = await supabase
        .from('expense_splits')
        .select('*')
        .in('expense_id', expensesData?.map((e) => e.id) || []);

      const balancesMap: Record<string, number> = {};
      (membersData || []).forEach((member) => {
        balancesMap[member.user_id] = 0;
      });

      (expensesData || []).forEach((expense) => {
        balancesMap[expense.paid_by] = (balancesMap[expense.paid_by] || 0) + expense.amount;
      });

      (splits || []).forEach((split) => {
        balancesMap[split.user_id] = (balancesMap[split.user_id] || 0) - split.amount;
      });

      setBalances(balancesMap);
      setConnectionError(false);
    } catch (error: any) {
      console.error('[v0] Error loading group data:', error);
      const appError = parseError(error);
      setError(appError.userMessage);
      logError(appError, 'loadData');
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, currentUser?.id]);

  const setupRealtimeSubscriptions = useCallback(() => {
    if (!selectedGroupId) return;

    const handler: SubscriptionHandler = {
      onExpenseAdded: (expense) => {
        console.log('[v0] New expense received:', expense);
        loadData();
      },
      onSettlementUpdated: (settlement) => {
        console.log('[v0] Settlement updated:', settlement);
        loadData();
      },
      onMemberJoined: (member) => {
        console.log('[v0] Member joined:', member);
        loadData();
      },
      onError: (error) => {
        console.error('[v0] Realtime error:', error);
        setConnectionError(true);
        logError(parseError(error), 'realtimeSubscription');
      },
    };

    // Subscribe to group expenses
    const unsubscribe = realtimeManager.subscribeToGroupExpenses(
      selectedGroupId,
      handler
    );

    unsubscribeRef.current = unsubscribe;
  }, [selectedGroupId, loadData]);

  useEffect(() => {
    if (selectedGroupId) {
      loadData();
      setupRealtimeSubscriptions();
    }

    return () => {
      // Cleanup subscriptions on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [selectedGroupId, loadData, setupRealtimeSubscriptions]);

  async function handleDeleteGroup() {
    if (!selectedGroupId) return;
    if (!isGroupCreator) {
      toastManager.error('Only the group creator can delete this group.');
      return;
    }

    const confirmed = window.confirm(
      'Delete this group permanently? This is allowed only when all dues/settlements are cleared.'
    );
    if (!confirmed) return;

    setDeletingGroup(true);
    try {
      const result = await deleteGroup(selectedGroupId);
      if (!result.valid) {
        toastManager.warning(result.error || 'Group cannot be deleted yet.');
        return;
      }

      toastManager.success('Group deleted');
      setScreen('groups');
    } catch (deleteError: any) {
      const appError = parseError(deleteError);
      toastManager.error(appError.userMessage);
      logError(appError, 'deleteGroup');
    } finally {
      setDeletingGroup(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-24">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading group details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Connection Error */}
      {connectionError && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-3">
          <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-amber-700 text-sm">Connection unstable. Updates may be delayed.</p>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3">
          <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={20} />
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="p-6 flex items-center gap-3 mb-2">
        <button onClick={() => setScreen('groups')} className="text-muted-foreground">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-foreground">{groupName}</h1>
      </div>
      <div className="px-6 pb-4 text-muted-foreground text-sm">
        {members.length} members
      </div>
      {isGroupCreator && (
        <div className="px-6 pb-4">
          <button
            onClick={handleDeleteGroup}
            disabled={deletingGroup}
            className="w-full bg-destructive/20 text-destructive font-bold py-2.5 px-4 rounded-lg hover:bg-destructive/30 transition disabled:opacity-50"
          >
            {deletingGroup ? 'Deleting...' : 'Delete Group'}
          </button>
          <p className="text-muted-foreground text-xs mt-2">
            You can delete this group only when all dues/debts and settlements are cleared.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 px-6 mb-6">
        <button
          onClick={() => setTab('balances')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition ${
            tab === 'balances'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground'
          }`}
        >
          <BarChart3 size={18} className="inline mr-2" />
          Balances
        </button>
        <button
          onClick={() => setTab('expenses')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition ${
            tab === 'expenses'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground'
          }`}
        >
          Expenses
        </button>
      </div>

      {/* Content */}
      <div className="px-6">
        {tab === 'balances' ? (
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="bg-card rounded-lg p-4 border border-border">
                <p className="font-semibold text-foreground">
                  {memberNames[member.user_id] || 'Member'}
                </p>
                <p className={`text-lg font-bold ${balances[member.user_id] > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {balances[member.user_id] > 0 ? '+' : ''}Rs. {balances[member.user_id].toFixed(0)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="bg-card rounded-lg p-4 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-foreground">{expense.title}</h3>
                  <span className="text-lg font-bold text-foreground">Rs {expense.amount}</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  Paid by {memberNames[expense.paid_by] || 'Member'} • {new Date(expense.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setScreen('add-expense')}
        className="fixed bottom-28 right-6 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 transition"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}
