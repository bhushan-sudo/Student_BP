-- ==============================================================================
-- CAMPUSSPEND / POCKETWISE - SUPABASE & POSTGRESQL DATABASE SCHEMA
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STUDENT PROFILES & BUDGET SETTINGS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    college_name TEXT,
    currency TEXT DEFAULT 'INR',
    monthly_budget_limit NUMERIC(12, 2) DEFAULT 8000.00 CHECK (monthly_budget_limit >= 0),
    daily_budget_limit NUMERIC(12, 2) DEFAULT 350.00 CHECK (daily_budget_limit >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TRANSACTIONS (DAILY EXPENSES, POCKET MONEY, SCHOLARSHIPS, BANK/UPI STATEMENTS)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    payment_app TEXT DEFAULT 'UPI',
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    raw_upi_sms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DEDUPLICATION UNIQUE INDEX
-- Prevents importing the same transaction twice when uploading bank/UPI CSV statements
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_dedup
ON public.transactions (
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    transaction_date,
    amount,
    title
);

-- 4. SAVINGS GOALS (GADGETS, COURSES, TRIPS, EMERGENCY)
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
    current_saved NUMERIC(12, 2) DEFAULT 0.00 CHECK (current_saved >= 0),
    deadline DATE NOT NULL,
    status TEXT DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles access" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Public transactions access" ON public.transactions FOR ALL USING (true);
CREATE POLICY "Public goals access" ON public.savings_goals FOR ALL USING (true);

-- 6. TRIGGER TO AUTOMATICALLY CREATE STUDENT PROFILE ON AUTH SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, college_name, monthly_budget_limit, daily_budget_limit)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Student'),
    NEW.raw_user_meta_data->>'college_name',
    8000.00,
    350.00
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- EXAMPLE POSTGRESQL QUERY: BATCH INSERT CSV STATEMENT WITH DEDUPLICATION
-- ==============================================================================
-- INSERT INTO public.transactions (user_id, type, amount, title, category, payment_app, transaction_date, raw_upi_sms)
-- VALUES 
--     ('USER_UUID', 'EXPENSE', 150.00, 'College canteen', 'Food & Canteen', 'Bank Statement (CSV)', '2026-10-01', '01 Oct College canteen ₹150'),
--     ('USER_UUID', 'EXPENSE', 40.00, 'Bus ticket', 'Travel & Metro', 'Bank Statement (CSV)', '2026-10-02', '02 Oct Bus ticket ₹40'),
--     ('USER_UUID', 'EXPENSE', 500.00, 'Online shopping', 'Shopping & Essentials', 'Bank Statement (CSV)', '2026-10-03', '03 Oct Online shopping ₹500')
-- ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), transaction_date, amount, title)
-- DO NOTHING
-- RETURNING *;
