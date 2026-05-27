-- ============================================================================
-- Spendly Mobile - Supabase Schema Migration (safe for existing tables)
-- ============================================================================
-- This script safely adds any missing columns to your existing tables.
-- It will NOT break anything that already exists.
-- ============================================================================

-- 1. EXPENSES table - add columns that might be missing
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT auth.uid()::text;

-- 2. GROUPS table - add columns that might be missing
ALTER TABLE groups ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::jsonb;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT auth.uid()::text;

-- 3. Settlements table - add columns that might be missing
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS paid_by TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS split_among JSONB DEFAULT '[]'::jsonb;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS settled JSONB DEFAULT '[]'::jsonb;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS split_mode TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS custom_shares JSONB DEFAULT '{}'::jsonb;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 4. CATEGORIES table - add columns that might be missing
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 5. USER_PROFILES table - create if missing, add columns if partial
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT U&'\20B9',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5b. USER_SETTINGS table - persist budget limits and custom categories
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  budget_limits JSONB DEFAULT '{}'::jsonb,
  custom_categories JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5c. Create a public profile as soon as Supabase Auth creates a user.
-- Onboarding updates the name/salary/currency later, but this makes signup visible
-- in public.user_profiles immediately and keeps auth/profile rows connected.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, salary, currency)
  VALUES (
    NEW.id::text,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(NEW.email, '@', 1), ''),
      'User'
    ),
    0,
    U&'\20B9'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 6. Enable RLS on tables (safe - already enabled tables won't error)
ALTER TABLE IF EXISTS expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_settings ENABLE ROW LEVEL SECURITY;

-- 7. Secure Row Level Security (RLS) Policies
-- First, drop the broad dev/permissive policies if they exist
DROP POLICY IF EXISTS "Allow all on expenses" ON expenses;
DROP POLICY IF EXISTS "Allow all on user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow all on groups" ON groups;
DROP POLICY IF EXISTS "Allow all on settlements" ON settlements;
DROP POLICY IF EXISTS "Allow all on categories" ON categories;
DROP POLICY IF EXISTS "Allow users to manage their own expenses" ON expenses;
DROP POLICY IF EXISTS "Allow users to manage their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Allow members to access groups" ON groups;
DROP POLICY IF EXISTS "Allow group members to access settlements" ON settlements;
DROP POLICY IF EXISTS "Allow read access to categories" ON categories;
DROP POLICY IF EXISTS "Allow write access to categories" ON categories;
DROP POLICY IF EXISTS "Allow users to manage their own settings" ON user_settings;

-- Now create strict but transition-safe production policies
-- a) Expenses: Users can manage their own expenses, and access legacy expenses (where user_id is null)
CREATE POLICY "Allow users to manage their own expenses" ON expenses
  FOR ALL
  USING (user_id = auth.uid()::text OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid()::text OR user_id IS NULL);

-- b) User Profiles: Users can only see/modify their own profile details
CREATE POLICY "Allow users to manage their own profile" ON user_profiles
  FOR ALL
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- b2) User Settings: Users can only read/write their own persisted app settings
CREATE POLICY "Allow users to manage their own settings" ON user_settings
  FOR ALL
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- c) Groups: Users can access groups they created OR are members of (matched case-insensitively)
CREATE POLICY "Allow members to access groups" ON groups
  FOR ALL
  USING (
    created_by = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()::text
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(groups.members, '[]'::jsonb)) AS m
        WHERE lower(m) = lower(user_profiles.name)
      )
    )
  );

-- d) Settlements: Users can access settlements for groups they created OR are members of
CREATE POLICY "Allow group members to access settlements" ON settlements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = settlements.group_id
      AND (
        groups.created_by = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()::text
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(groups.members, '[]'::jsonb)) AS m
            WHERE lower(m) = lower(user_profiles.name)
          )
        )
      )
    )
  );

-- e) Categories: Anyone can read categories, but only authenticated users can write them
CREATE POLICY "Allow read access to categories" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Allow write access to categories" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Safe index creation
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at);
