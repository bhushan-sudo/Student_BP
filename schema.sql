-- ==============================================================================
-- CAMPUSSPEND - SUPABASE DATABASE SCHEMA FOR STUDENT BUDGET PLANNER
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

-- 2. TRANSACTIONS (EXPENSES & INFLOW: POCKET MONEY / SCHOLARSHIP / UPI)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Food & Canteen',
        'Travel & Metro',
        'Education & Books',
        'Hostel & Rent',
        'Shopping & Essentials',
        'Entertainment',
        'Pocket Money',
        'Scholarship',
        'Savings Deposit',
        'Income',
        'Other'
    )),
    payment_app TEXT DEFAULT 'UPI',
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    raw_upi_sms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SAVINGS GOALS (GADGETS, COURSES, TRIPS, EMERGENCY)
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
    current_saved NUMERIC(12, 2) DEFAULT 0.00 CHECK (current_saved >= 0),
    deadline DATE NOT NULL,
    status TEXT DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profile" 
ON public.profiles FOR ALL 
USING (auth.uid() = id);

CREATE POLICY "Users can manage their own transactions" 
ON public.transactions FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own savings goals" 
ON public.savings_goals FOR ALL 
USING (auth.uid() = user_id);

-- 5. TRIGGER FOR NEW USER SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, monthly_budget_limit, daily_budget_limit)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Student'),
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

