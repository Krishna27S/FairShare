'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, TrendingDown, TrendingUp } from 'lucide-react';

interface MonthlyData {
  month: string;
  spent: number;
  budget: number;
  balance: number;
  date: Date;
}

export function SpendingAnalysisScreen() {
  const { currentUser, setScreen } = useApp();
  const [spending, setSpending] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<MonthlyData | null>(null);

  const loadSpendingHistory = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const { data, error } = await supabase
        .from('monthly_spending')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('month_year', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        month: new Date(item.month_year).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        spent: item.total_spent || 0,
        budget: item.monthly_budget || 0,
        balance: item.balance || 0,
        date: new Date(item.month_year),
      }));

      setSpending(formatted);
      if (formatted.length > 0) {
        setSelectedMonth(formatted[0]);
      }
    } catch (error) {
      console.error('[v0] Error loading spending history:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) {
      loadSpendingHistory();
    }
  }, [currentUser?.id, loadSpendingHistory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-24">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading spending analysis...</p>
        </div>
      </div>
    );
  }

  const avgSpent = spending.length > 0 
    ? spending.reduce((sum, m) => sum + m.spent, 0) / spending.length 
    : 0;
  const avgBudget = spending.length > 0 
    ? spending.reduce((sum, m) => sum + m.budget, 0) / spending.length 
    : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="p-6 flex items-center gap-3 mb-4">
        <button onClick={() => setScreen('activity')} className="text-muted-foreground">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-foreground">Spending Analysis</h1>
      </div>

      {spending.length === 0 ? (
        <div className="px-6 text-center py-12">
          <p className="text-muted-foreground mb-2">No spending data yet</p>
          <p className="text-sm text-muted-foreground">
            Your monthly spending will appear here once you set a budget and add expenses.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="px-6 mb-6 grid grid-cols-3 gap-3">
            <div className="bg-card rounded-lg p-3 border border-border text-center">
              <p className="text-muted-foreground text-xs mb-1">Avg Budget</p>
              <p className="font-bold text-foreground">Rs. {avgBudget.toFixed(0)}</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border text-center">
              <p className="text-muted-foreground text-xs mb-1">Avg Spent</p>
              <p className="font-bold text-foreground">Rs. {avgSpent.toFixed(0)}</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border text-center">
              <p className="text-muted-foreground text-xs mb-1">Months</p>
              <p className="font-bold text-foreground">{spending.length}</p>
            </div>
          </div>

          {/* Selected Month Details */}
          {selectedMonth && (
            <div className="px-6 mb-6 bg-card rounded-lg p-6 border border-border">
              <h2 className="text-lg font-bold text-foreground mb-4">{selectedMonth.month}</h2>
              
              <div className="space-y-4 mb-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Budget</span>
                    <span className="font-bold text-foreground">Rs. {selectedMonth.budget.toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Spent</span>
                    <span className="font-bold text-foreground">Rs. {selectedMonth.spent.toFixed(2)}</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        selectedMonth.spent > selectedMonth.budget ? 'bg-destructive' : 'bg-success'
                      }`}
                      style={{
                        width: `${Math.min((selectedMonth.spent / selectedMonth.budget) * 100, 100)}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((selectedMonth.spent / selectedMonth.budget) * 100).toFixed(0)}% of budget
                  </p>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Balance</span>
                    <div className="flex items-center gap-2">
                      {selectedMonth.balance < 0 ? (
                        <TrendingDown size={16} className="text-destructive" />
                      ) : (
                        <TrendingUp size={16} className="text-success" />
                      )}
                      <span
                        className={`font-bold ${
                          selectedMonth.balance < 0 ? 'text-destructive' : 'text-success'
                        }`}
                      >
                        {selectedMonth.balance < 0 ? '-' : '+'}Rs. {Math.abs(selectedMonth.balance).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Monthly History */}
          <div className="px-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
              Monthly History
            </h3>
            <div className="space-y-2">
              {spending.map((month, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedMonth(month)}
                  className={`w-full rounded-lg p-4 border transition text-left ${
                    selectedMonth === month
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card border-border hover:border-primary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{month.month}</p>
                      <p className="text-sm text-muted-foreground">
                        Rs. {month.spent.toFixed(0)} / Rs. {month.budget.toFixed(0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold text-sm ${
                          month.balance < 0 ? 'text-destructive' : 'text-success'
                        }`}
                      >
                        {month.balance < 0 ? '-' : '+'}Rs. {Math.abs(month.balance).toFixed(0)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {((month.spent / month.budget) * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
