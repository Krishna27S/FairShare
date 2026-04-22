-- ============================================================
-- FairShare — FINAL Complete RLS Setup
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Drop ALL existing policies
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Drop any old helper functions
DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS is_group_member CASCADE';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- STEP 2: Enable RLS
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log   ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- USERS
-- SELECT: Allow all authenticated users to see profiles
--   (needed for settlements screen JOIN, member names, etc.)
-- INSERT/UPDATE: Only your own row
-- ============================================================
CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_insert" ON users
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "users_update" ON users
  FOR UPDATE TO authenticated USING (id = auth.uid());


-- ============================================================
-- GROUP_MEMBERS
-- SELECT: All authenticated (avoids infinite recursion)
-- INSERT: Add yourself OR add others to groups you're already in
-- DELETE: Remove yourself OR creator can remove anyone
-- ============================================================
CREATE POLICY "gm_select" ON group_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gm_insert" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "gm_delete_self" ON group_members
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "gm_delete_creator" ON group_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
        AND groups.created_by = auth.uid()
    )
  );


-- ============================================================
-- GROUPS
-- SELECT: Creator OR member (creator needed for .select() after INSERT)
-- INSERT: Only if you're the creator
-- UPDATE/DELETE: Only creator
-- ============================================================
CREATE POLICY "groups_select" ON groups
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "groups_insert" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups_update" ON groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "groups_delete" ON groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());


-- ============================================================
-- EXPENSES
-- SELECT/INSERT: Group members
-- DELETE: Expense creator OR group creator
-- ============================================================
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT TO authenticated
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE TO authenticated
  USING (
    paid_by = auth.uid()
    OR group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
  );


-- ============================================================
-- EXPENSE_SPLITS
-- SELECT/INSERT: Group members
-- DELETE: Expense creator OR group creator
-- ============================================================
CREATE POLICY "splits_select" ON expense_splits
  FOR SELECT TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE e.group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "splits_insert" ON expense_splits
  FOR INSERT TO authenticated
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE e.group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "splits_delete" ON expense_splits
  FOR DELETE TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE e.paid_by = auth.uid()
         OR e.group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
    )
  );


-- ============================================================
-- SETTLEMENTS
-- All operations: Group members
-- ============================================================
CREATE POLICY "settlements_select" ON settlements
  FOR SELECT TO authenticated
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "settlements_insert" ON settlements
  FOR INSERT TO authenticated
  WITH CHECK (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "settlements_update" ON settlements
  FOR UPDATE TO authenticated
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "settlements_delete" ON settlements
  FOR DELETE TO authenticated
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));


-- ============================================================
-- ACTIVITY_LOG
-- INSERT: Your own activity
-- SELECT: Your groups or global (null group_id)
-- DELETE: Group creator (for cleanup during group deletion)
-- ============================================================
CREATE POLICY "activity_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "activity_select" ON activity_log
  FOR SELECT TO authenticated
  USING (
    group_id IS NULL
    OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "activity_delete" ON activity_log
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
  );
