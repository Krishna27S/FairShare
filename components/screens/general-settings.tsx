'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Save, TrendingUp } from 'lucide-react';

export function GeneralSettingsScreen() {
  const { currentUser, setScreen, userProfile, refreshUserProfile } = useApp();
  const [monthlyBudget, setMonthlyBudget] = useState('15000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (userProfile?.monthly_budget) {
      setMonthlyBudget(userProfile.monthly_budget.toString());
    }
  }, [userProfile]);

  async function handleSaveBudget() {
    if (!currentUser?.id) return;

    const budget = parseFloat(monthlyBudget);
    if (!budget || budget <= 0) {
      setError('Budget must be greater than 0');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ monthly_budget: budget })
        .eq('id', currentUser.id);

      if (updateError) throw updateError;

      // Update current month's spending record
      const now = new Date();
      const monthYear = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const { data: existing } = await supabase
        .from('monthly_spending')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('month_year', monthYear.toISOString().split('T')[0])
        .single();

      if (existing) {
        await supabase
          .from('monthly_spending')
          .update({ monthly_budget: budget })
          .eq('id', existing.id);
      } else {
        await supabase.from('monthly_spending').insert({
          user_id: currentUser.id,
          month_year: monthYear.toISOString().split('T')[0],
          monthly_budget: budget,
          total_spent: 0,
          balance: budget,
        });
      }

      await refreshUserProfile();
      setSuccess('Budget updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('[v0] Error saving budget:', error);
      setError(error.message || 'Failed to save budget');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="p-6 flex items-center gap-3 mb-4">
        <button onClick={() => setScreen('activity')} className="text-muted-foreground">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-foreground">General Settings</h1>
      </div>

      <div className="px-6 space-y-6">
        {/* Monthly Budget Section */}
        <div className="bg-card rounded-lg p-6 border border-border">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Monthly Budget</h2>
              <p className="text-muted-foreground text-sm">Set your spending limit and track your expenses</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Budget Amount (Rs.)</label>
              <input
                type="number"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                placeholder="Enter budget amount"
                min="0"
                step="100"
              />
              <p className="text-xs text-muted-foreground mt-2">
                This budget is used to calculate your spending percentage each month and appears on your dashboard.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <p className="text-success text-sm">{success}</p>
              </div>
            )}

            <button
              onClick={handleSaveBudget}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {loading ? 'Saving...' : 'Save Budget'}
            </button>
          </div>
        </div>

        {/* Spending Analysis Section */}
        <div className="bg-card rounded-lg p-6 border border-border">
          <h2 className="font-bold text-foreground mb-2">Spending Analysis</h2>
          <p className="text-muted-foreground text-sm mb-4">
            View your monthly spending habits and compare them to your budget.
          </p>
          <button
            onClick={() => setScreen('spending-analysis')}
            className="w-full bg-secondary text-foreground py-3 rounded-lg font-semibold hover:bg-secondary/80 transition"
          >
            View Spending Analysis
          </button>
        </div>

        {/* Account Info Section */}
        <div className="bg-card rounded-lg p-6 border border-border">
          <h2 className="font-bold text-foreground mb-4">Account Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground text-sm">Email</p>
              <p className="font-medium text-foreground">{currentUser?.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">User Type</p>
              <p className="font-medium text-foreground capitalize">{userProfile?.role || 'Individual'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Member Since</p>
              <p className="font-medium text-foreground">
                {currentUser?.created_at
                  ? new Date(currentUser.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Recently'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
