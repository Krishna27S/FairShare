-- ============================================================
-- FairShare — Fix Settlements Unique Constraint
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================
-- Problem: The unique constraint on (group_id, from_user_id, to_user_id)
-- prevents having both a confirmed settlement AND a new pending one
-- for the same user pair, causing "duplicate key" errors when adding expenses.

-- STEP 1: Drop the problematic unique constraint
ALTER TABLE settlements
  DROP CONSTRAINT IF EXISTS settlements_group_id_from_user_id_to_user_id_key;

-- Also drop the variant name in case it was auto-generated differently
ALTER TABLE settlements
  DROP CONSTRAINT IF EXISTS settlements_group_id_from_user_id_to_user_id_key1;

-- STEP 2: Clean up any stuck/orphaned settlements that might cause issues.
-- Delete duplicate pending rows (keep only the latest per pair).
DELETE FROM settlements a
  USING settlements b
  WHERE a.group_id = b.group_id
    AND a.from_user_id = b.from_user_id
    AND a.to_user_id = b.to_user_id
    AND a.status = 'pending'
    AND b.status = 'pending'
    AND a.created_at < b.created_at;

-- STEP 3: Verify — list remaining settlements (informational)
SELECT id, group_id, from_user_id, to_user_id, amount, status, is_settled
FROM settlements
ORDER BY group_id, created_at DESC;
