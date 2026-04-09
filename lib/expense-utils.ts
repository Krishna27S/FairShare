import { supabase, Settlement, Expense, ExpenseSplit } from './supabase';

/**
 * Validate expense amount
 */
export function validateExpenseAmount(amount: number): { valid: boolean; error?: string } {
  if (!amount || amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }
  if (!Number.isFinite(amount)) {
    return { valid: false, error: 'Invalid amount' };
  }
  return { valid: true };
}

/**
 * Calculate equal split for an expense
 */
export function calculateEqualSplit(
  amount: number,
  participants: string[]
): Record<string, number> {
  if (participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  const splitAmount = Math.round((amount / participants.length) * 100) / 100;
  const remainder = Math.round((amount - splitAmount * participants.length) * 100) / 100;

  const splits: Record<string, number> = {};
  participants.forEach((userId, index) => {
    splits[userId] = index === 0 ? splitAmount + remainder : splitAmount;
  });

  return splits;
}

/**
 * Validate custom splits
 */
export function validateCustomSplits(
  amount: number,
  splits: Record<string, number>
): { valid: boolean; error?: string } {
  const total = Object.values(splits).reduce((sum, val) => sum + val, 0);
  const difference = Math.abs(total - amount);

  if (difference > 0.01) {
    return {
      valid: false,
      error: `Split total (Rs. ${total.toFixed(2)}) must equal expense amount (Rs. ${amount.toFixed(2)})`,
    };
  }

  const hasNegative = Object.values(splits).some((v) => v < 0);
  if (hasNegative) {
    return { valid: false, error: 'All split amounts must be positive' };
  }

  return { valid: true };
}

/**
 * Calculate settlements using the Minimize Cash Flow algorithm
 * This algorithm minimizes the number of transactions needed to settle all debts
 */
export function calculateOptimizedSettlements(
  expenses: Expense[],
  splits: ExpenseSplit[],
  groupMembers: string[]
): Array<{ from: string; to: string; amount: number }> {
  // Calculate net balance for each user
  const balances: Record<string, number> = {};

  groupMembers.forEach((memberId) => {
    balances[memberId] = 0;
  });

  // Add expenses paid
  expenses.forEach((expense) => {
    balances[expense.paid_by] = (balances[expense.paid_by] || 0) + expense.amount;
  });

  // Subtract splits owed
  splits.forEach((split) => {
    balances[split.user_id] = (balances[split.user_id] || 0) - split.amount;
  });

  // Create settlement transactions
  const settlements: Array<{ from: string; to: string; amount: number }> = [];
  const debtors = Object.entries(balances)
    .filter(([_, balance]) => balance < 0)
    .map(([userId, balance]) => ({ userId, amount: Math.abs(balance) }));

  const creditors = Object.entries(balances)
    .filter(([_, balance]) => balance > 0)
    .map(([userId, balance]) => ({ userId, amount: balance }));

  let debtorIdx = 0;
  let creditorIdx = 0;

  while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
    const debtor = debtors[debtorIdx];
    const creditor = creditors[creditorIdx];

    const amount = Math.min(debtor.amount, creditor.amount);
    settlements.push({
      from: debtor.userId,
      to: creditor.userId,
      amount: Math.round(amount * 100) / 100,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) debtorIdx++;
    if (creditor.amount === 0) creditorIdx++;
  }

  return settlements;
}

/**
 * Save settlements to database
 */
export async function saveSettlements(
  groupId: string,
  settlements: Array<{ from: string; to: string; amount: number }>
) {
  // First, clear previous unsettled settlements for this group
  const { error: deleteError } = await supabase
    .from('settlements')
    .delete()
    .eq('group_id', groupId)
    .eq('is_settled', false);

  if (deleteError) throw deleteError;

  // Insert new settlements
  const { error: insertError } = await supabase
    .from('settlements')
    .insert(
      settlements.map((s) => ({
        group_id: groupId,
        from_user_id: s.from,
        to_user_id: s.to,
        amount: s.amount,
        is_settled: false,
      }))
    );

  if (insertError) throw insertError;
}

/**
 * Mark settlement as paid
 */
export async function recordPayment(settlementId: string) {
  const { error } = await supabase
    .from('settlements')
    .update({
      is_settled: true,
      settled_at: new Date().toISOString(),
    })
    .eq('id', settlementId);

  if (error) throw error;
}

/**
 * Get balance for a user in a group
 */
export async function getUserGroupBalance(groupId: string, userId: string) {
  const { data: expenses, error: expenseError } = await supabase
    .from('expenses')
    .select('id, amount, paid_by')
    .eq('group_id', groupId);

  if (expenseError) throw expenseError;

  const { data: splits, error: splitError } = await supabase
    .from('expense_splits')
    .select('expense_id, user_id, amount')
    .in('expense_id', expenses?.map((e) => e.id) || []);

  if (splitError) throw splitError;

  let paid = 0;
  let owes = 0;

  expenses?.forEach((expense) => {
    if (expense.paid_by === userId) {
      paid += expense.amount;
    }
  });

  splits?.forEach((split) => {
    if (split.user_id === userId) {
      owes += split.amount;
    }
  });

  return { paid, owes, balance: paid - owes };
}

/**
 * Get total balance across all groups for a user
 */
export async function getUserTotalBalance(userId: string) {
  const { data: userGroups, error: groupError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (groupError) throw groupError;

  const groupIds = userGroups?.map((g) => g.group_id) || [];

  let totalOwes = 0;
  let totalGetsBack = 0;

  for (const groupId of groupIds) {
    const balance = await getUserGroupBalance(groupId, userId);
    if (balance.balance < 0) {
      totalOwes += Math.abs(balance.balance);
    } else {
      totalGetsBack += balance.balance;
    }
  }

  return { owes: totalOwes, getsBack: totalGetsBack };
}
