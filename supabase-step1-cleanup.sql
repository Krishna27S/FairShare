-- ============================================================
-- STEP 1: RUN THIS FIRST (alone, by itself)
-- This drops everything to start completely clean
-- ============================================================

-- Drop ALL existing policies
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Drop ALL versions of the function (handles any parameter names)
DROP FUNCTION IF EXISTS is_group_member CASCADE;
DROP FUNCTION IF EXISTS is_group_member(UUID, UUID) CASCADE;
