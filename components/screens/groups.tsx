'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase, Group } from '@/lib/supabase';
import { toastManager } from '@/lib/toast';
import { logActivity } from '@/lib/activity-utils';
import { isValidEmail } from '@/lib/auth-utils';
import { ChevronLeft, Plus, Search, AlertCircle } from 'lucide-react';

type GroupWithStats = Group & {
  memberCount: number;
  netBalance: number;
};

export function GroupsScreen() {
  const { currentUser, setScreen, setSelectedGroupId } = useApp();
  const [groups, setGroups] = useState<GroupWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const [loading, setLoading] = useState(true);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [error, setError] = useState('');

  const loadGroups = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*');

      if (groupsError) throw groupsError;
      if (!groupsData || groupsData.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = groupsData.map((g) => g.id);

      const { data: membershipRows, error: membershipError } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds);
      if (membershipError) throw membershipError;

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('id, group_id, amount, paid_by')
        .in('group_id', groupIds);
      if (expensesError) throw expensesError;

      const expenseIds = (expensesData || []).map((e) => e.id);
      let splitsData: { expense_id: string; amount: number }[] = [];
      if (expenseIds.length > 0) {
        const { data: userSplits, error: splitsError } = await supabase
          .from('expense_splits')
          .select('expense_id, amount')
          .in('expense_id', expenseIds)
          .eq('user_id', currentUser.id);
        if (splitsError) throw splitsError;
        splitsData = userSplits || [];
      }

      const memberCountByGroup = new Map<string, number>();
      (membershipRows || []).forEach((row) => {
        memberCountByGroup.set(row.group_id, (memberCountByGroup.get(row.group_id) || 0) + 1);
      });

      const expenseById = new Map((expensesData || []).map((e) => [e.id, e]));
      const netByGroup = new Map<string, number>();

      (expensesData || []).forEach((expense) => {
        if (expense.paid_by === currentUser.id) {
          netByGroup.set(
            expense.group_id,
            (netByGroup.get(expense.group_id) || 0) + Number(expense.amount || 0)
          );
        }
      });

      splitsData.forEach((split) => {
        const expense = expenseById.get(split.expense_id);
        if (!expense) return;
        netByGroup.set(
          expense.group_id,
          (netByGroup.get(expense.group_id) || 0) - Number(split.amount || 0)
        );
      });

      const withStats: GroupWithStats[] = groupsData.map((group) => ({
        ...group,
        memberCount: memberCountByGroup.get(group.id) || 1,
        netBalance: netByGroup.get(group.id) || 0,
      }));

      setGroups(withStats);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function createNewGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser?.id) return;

    setError('');
    setCreatingGroup(true);

    try {
      // Validate group name
      if (!groupName.trim()) {
        throw new Error('Group name is required');
      }
      // Parse member emails
      const memberEmails = groupMembers
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e && e !== currentUser.email); // Exclude empty and creator's email

      // Validate ALL email formats BEFORE creating the group
      const invalidEmails: string[] = [];
      for (const email of memberEmails) {
        if (!isValidEmail(email)) {
          invalidEmails.push(email);
        }
      }

      if (invalidEmails.length > 0) {
        throw new Error(
          `Invalid email${invalidEmails.length > 1 ? 's' : ''}: ${invalidEmails.join(', ')}. Please enter valid email addresses.`
        );
      }

      // Create group (only after all emails are validated)
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert([{ name: groupName, created_by: currentUser.id }])
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as member
      await supabase.from('group_members').insert([
        {
          group_id: group.id,
          user_id: currentUser.id,
        },
      ]);

      const notRegisteredEmails: string[] = [];
      const addedMembers: string[] = [];

      for (const email of memberEmails) {
        const { data: matchedUsers, error: findUserError } = await supabase.rpc(
          'find_registered_user_by_email',
          { search_email: email }
        );

        if (findUserError) throw findUserError;

        const userData = matchedUsers?.[0];
        if (userData?.id) {
          await supabase.from('group_members').insert([
            {
              group_id: group.id,
              user_id: userData.id,
            },
          ]);
          addedMembers.push(userData.full_name || email);
        } else {
          notRegisteredEmails.push(email);
        }
      }

      // Log group creation activity (non-blocking for core flow)
      try {
        await logActivity('group_created', currentUser.id, group.id, `Created group "${groupName}"`, {
          groupName,
          memberCount: addedMembers.length + 1, // +1 for creator
        });
      } catch (activityError) {
        console.warn('[v0] Failed to log group creation activity:', activityError);
      }

      // Show notifications
      if (addedMembers.length > 0) {
        toastManager.success(`Group created with ${addedMembers.length + 1} member(s)`);
      } else {
        toastManager.success('Group created');
      }

      if (notRegisteredEmails.length > 0) {
        toastManager.warning(
          `${notRegisteredEmails.length} member(s) not registered: ${notRegisteredEmails.join(', ')}`
        );
      }

      setGroupName('');
      setGroupMembers('');
      setShowNewGroupModal(false);
      loadGroups();
    } catch (error: any) {
      console.error('[v0] Error creating group:', error);
      const errorMessage =
        error?.message || error?.error_description || error?.details || 'Failed to create group';
      setError(errorMessage);
      toastManager.error(errorMessage);
    } finally {
      setCreatingGroup(false);
    }
  }

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('dashboard')} className="text-muted-foreground">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold text-foreground">Groups</h1>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
          <input
            type="text"
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder-muted-foreground"
          />
        </div>
      </div>

      {/* Groups List */}
      <div className="px-6 space-y-3">
        {filteredGroups.map((group) => (
          <button
            key={group.id}
            onClick={() => {
              setSelectedGroupId(group.id);
              setScreen('group-detail');
            }}
            className="w-full bg-card rounded-lg p-4 border border-border hover:border-primary transition flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center font-bold text-foreground">
                {group.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-foreground">{group.name}</h3>
                <p className="text-muted-foreground text-sm">{group.memberCount} members</p>
              </div>
            </div>
            <span
              className={`font-bold text-sm ${
                group.netBalance > 0 ? 'text-green-500' : group.netBalance < 0 ? 'text-red-500' : 'text-muted-foreground'
              }`}
            >
              {group.netBalance > 0 ? '+' : ''}
              Rs. {group.netBalance.toFixed(0)}
            </span>
          </button>
        ))}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowNewGroupModal(true)}
        className="fixed bottom-28 right-6 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 transition"
      >
        <Plus size={28} />
      </button>

      {/* New Group Modal */}
      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-card rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h2 className="text-2xl font-bold text-foreground">New Group</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Add members by their registered email addresses
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3">
                <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={20} />
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={createNewGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. Weekend Trip"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  disabled={creatingGroup}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder-muted-foreground disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Members (Optional)
                </label>
                <textarea
                  placeholder="Enter emails separated by commas
e.g. john@example.com, jane@example.com"
                  value={groupMembers}
                  onChange={(e) => setGroupMembers(e.target.value)}
                  disabled={creatingGroup}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder-muted-foreground resize-none disabled:opacity-50"
                  rows={4}
                />
                <p className="text-muted-foreground text-xs mt-2">
                  Only registered users will be added. Unregistered emails will be shown as a warning.
                </p>
              </div>

              <button
                type="submit"
                disabled={creatingGroup || !groupName.trim()}
                className="w-full bg-success text-success-foreground font-bold py-3 px-4 rounded-lg hover:bg-success/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowNewGroupModal(false);
                  setError('');
                  setGroupName('');
                  setGroupMembers('');
                }}
                disabled={creatingGroup}
                className="w-full bg-destructive/20 text-destructive font-bold py-3 px-4 rounded-lg hover:bg-destructive/30 transition disabled:opacity-50"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
