-- ============================================================
-- STEP 2: RUN THIS AFTER STEP 1 SUCCEEDS
-- Creates the helper function and all RLS policies
-- ============================================================

-- Helper function (SECURITY DEFINER bypasses RLS, avoids recursion)
CREATE FUNCTION is_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id
      AND user_id = check_user_id
  );
$$;


-- Enable RLS on all tables
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log   ENABLE ROW LEVEL SECURITY;


-- USERS
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (id = auth.uid());


-- GROUPS
CREATE POLICY "groups_insert" ON groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "groups_select" ON groups FOR SELECT TO authenticated
  USING (is_group_member(id, auth.uid()));
CREATE POLICY "groups_update" ON groups FOR UPDATE TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "groups_delete" ON groups FOR DELETE TO authenticated
  USING (created_by = auth.uid());


-- GROUP_MEMBERS (uses helper function to avoid recursion)
CREATE POLICY "gm_insert" ON group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "gm_select" ON group_members FOR SELECT TO authenticated
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "gm_delete_self" ON group_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "gm_delete_creator" ON group_members FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM groups WHERE groups.id = group_members.group_id AND groups.created_by = auth.uid())
  );


-- EXPENSES
CREATE POLICY "expenses_insert" ON expenses FOR INSERT TO authenticated
  WITH CHECK (is_group_member(group_id, auth.uid()));
CREATE POLICY "expenses_select" ON expenses FOR SELECT TO authenticated
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated
  USING (paid_by = auth.uid());


-- EXPENSE_SPLITS
CREATE POLICY "splits_insert" ON expense_splits FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_splits.expense_id
        AND is_group_member(e.group_id, auth.uid())
    )
  );
CREATE POLICY "splits_select" ON expense_splits FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_splits.expense_id
        AND is_group_member(e.group_id, auth.uid())
    )
  );
CREATE POLICY "splits_delete" ON expense_splits FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_splits.expense_id
        AND e.paid_by = auth.uid()
    )
  );


-- SETTLEMENTS
CREATE POLICY "settlements_insert" ON settlements FOR INSERT TO authenticated
  WITH CHECK (is_group_member(group_id, auth.uid()));
CREATE POLICY "settlements_select" ON settlements FOR SELECT TO authenticated
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "settlements_update" ON settlements FOR UPDATE TO authenticated
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "settlements_delete" ON settlements FOR DELETE TO authenticated
  USING (is_group_member(group_id, auth.uid()));


-- ACTIVITY_LOG
CREATE POLICY "activity_insert" ON activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "activity_select" ON activity_log FOR SELECT TO authenticated
  USING (
    group_id IS NULL
    OR is_group_member(group_id, auth.uid())
  );
