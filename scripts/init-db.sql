-- Users table with role system
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'individual' CHECK (role IN ('individual', 'organisation')),
  monthly_budget DECIMAL(10, 2) DEFAULT 15000,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Keep public.users in sync with auth.users
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    monthly_budget,
    notifications_enabled
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'individual'),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'individual') = 'individual' THEN 15000
      ELSE NULL
    END,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    role = COALESCE(EXCLUDED.role, public.users.role),
    monthly_budget = COALESCE(EXCLUDED.monthly_budget, public.users.monthly_budget),
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Organisations table
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Buildings table (under organisations)
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table (under buildings)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Room members table
CREATE TABLE IF NOT EXISTS room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, user_id)
);

-- Groups table (for individual users)
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_type TEXT DEFAULT 'normal' CHECK (group_type IN ('normal', 'room')),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  paid_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'custom')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Expense splits table
CREATE TABLE IF NOT EXISTS expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expense_id, user_id)
);

-- Monthly spending history table for spending analysis
CREATE TABLE IF NOT EXISTS monthly_spending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year DATE NOT NULL,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  monthly_budget DECIMAL(10, 2),
  balance DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month_year)
);

-- Settlements table
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  is_settled BOOLEAN DEFAULT FALSE,
  settled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, from_user_id, to_user_id)
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_spending ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS checks (SECURITY DEFINER avoids recursive RLS evaluation)
CREATE OR REPLACE FUNCTION is_group_member(target_group_id UUID, target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    WHERE gm.group_id = target_group_id
      AND gm.user_id = target_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_group_creator(target_group_id UUID, target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM groups g
    WHERE g.id = target_group_id
      AND g.created_by = target_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_group_creator(UUID, UUID) TO authenticated;

-- Helper to find a registered user by exact email (case-insensitive).
-- SECURITY DEFINER allows lookup without broad users table SELECT permissions.
CREATE OR REPLACE FUNCTION find_registered_user_by_email(search_email TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.full_name
  FROM users u
  WHERE lower(u.email) = lower(trim(search_email))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION find_registered_user_by_email(TEXT) TO authenticated;

-- Helper to resolve member profile info for a group.
CREATE OR REPLACE FUNCTION get_group_member_profiles(target_group_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gm.user_id, u.full_name, u.email
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = target_group_id
$$;

GRANT EXECUTE ON FUNCTION get_group_member_profiles(UUID) TO authenticated;

-- RLS Policies for users
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for groups
DROP POLICY IF EXISTS "Users can view groups they're members of" ON groups;
CREATE POLICY "Users can view groups they're members of" ON groups
  FOR SELECT USING (
    created_by = auth.uid() OR
    is_group_member(id, auth.uid())
  );

CREATE POLICY "Users can create groups" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Group creators can delete groups" ON groups;
CREATE POLICY "Group creators can delete groups" ON groups
  FOR DELETE USING (created_by = auth.uid());

-- RLS Policies for group_members
DROP POLICY IF EXISTS "Users can view members of groups they're in" ON group_members;
CREATE POLICY "Users can view members of groups they're in" ON group_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    is_group_creator(group_id, auth.uid()) OR
    is_group_member(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
CREATE POLICY "Group creators can add members" ON group_members
  FOR INSERT WITH CHECK (
    is_group_creator(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can add themselves to groups" ON group_members;
CREATE POLICY "Users can add themselves to groups" ON group_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for expenses
CREATE POLICY "Users can view expenses in their groups" ON expenses
  FOR SELECT USING (
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    ) OR
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create expenses in their groups" ON expenses
  FOR INSERT WITH CHECK (
    paid_by = auth.uid() AND (
      group_id IN (
        SELECT id FROM groups WHERE created_by = auth.uid()
      ) OR
      group_id IN (
        SELECT group_id FROM group_members WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for expense_splits
CREATE POLICY "Users can view splits for their group expenses" ON expense_splits
  FOR SELECT USING (
    user_id = auth.uid() OR
    expense_id IN (
      SELECT id FROM expenses WHERE 
        group_id IN (
          SELECT id FROM groups WHERE created_by = auth.uid()
        ) OR
        group_id IN (
          SELECT group_id FROM group_members WHERE user_id = auth.uid()
        )
    )
  );

-- RLS Policies for settlements
CREATE POLICY "Users can view settlements in their groups" ON settlements
  FOR SELECT USING (
    from_user_id = auth.uid() OR
    to_user_id = auth.uid() OR
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    ) OR
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for activity_log
DROP POLICY IF EXISTS "Users can create activity in their groups" ON activity_log;
CREATE POLICY "Users can create activity in their groups" ON activity_log
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
      group_id IS NULL OR
      is_group_creator(group_id, auth.uid()) OR
      is_group_member(group_id, auth.uid())
    )
  );

CREATE POLICY "Users can view activity in their groups" ON activity_log
  FOR SELECT USING (
    user_id = auth.uid() OR
    group_id IS NULL OR
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    ) OR
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for organisations
CREATE POLICY "Users can view organisations they own or are members of" ON organisations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM rooms
      JOIN room_members ON room_members.room_id = rooms.id
      WHERE rooms.building_id IN (
        SELECT id FROM buildings WHERE buildings.organisation_id = organisations.id
      )
      AND room_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Org users can create organisations" ON organisations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'organisation'
    )
  );

-- RLS Policies for buildings
CREATE POLICY "Users can view buildings in their organisations" ON buildings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organisations
      WHERE organisations.id = buildings.organisation_id
      AND organisations.owner_id = auth.uid()
    )
  );

CREATE POLICY "Org owners can create buildings" ON buildings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisations
      WHERE organisations.id = buildings.organisation_id
      AND organisations.owner_id = auth.uid()
    )
  );

-- RLS Policies for rooms
CREATE POLICY "Users can view rooms they're members of" ON rooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = rooms.id
      AND room_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners can create rooms" ON rooms
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM buildings
      JOIN organisations ON organisations.id = buildings.organisation_id
      WHERE buildings.id = rooms.building_id
      AND organisations.owner_id = auth.uid()
    )
  );

-- RLS Policies for room_members
CREATE POLICY "Users can view their room members" ON room_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members AS rm
      WHERE rm.room_id = room_members.room_id
      AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners can add room members" ON room_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms
      JOIN buildings ON buildings.id = rooms.building_id
      JOIN organisations ON organisations.id = buildings.organisation_id
      WHERE rooms.id = room_members.room_id
      AND organisations.owner_id = auth.uid()
    )
  );

-- RLS Policies for monthly_spending
CREATE POLICY "Users can view their own spending history" ON monthly_spending
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own spending history" ON monthly_spending
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own spending history" ON monthly_spending
  FOR INSERT WITH CHECK (user_id = auth.uid());
