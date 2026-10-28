require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, database.html, api.js, icons, etc.)
app.use(express.static(path.join(__dirname)));

// Root route: serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Database route: serve database.html
app.get('/database', (req, res) => {
  res.sendFile(path.join(__dirname, 'database.html'));
});

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isSupabaseConfigured = supabaseUrl && 
                             !supabaseUrl.includes('your-project') && 
                             supabaseKey && 
                             !supabaseKey.includes('your-supabase-key');

let supabase = null;
if (isSupabaseConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Connected to Supabase Cloud Database');
  } catch (e) {
    console.warn('⚠️ Supabase init warning:', e.message);
  }
} else {
  console.log('ℹ️ Running with fallback persistence (configure .env with Supabase credentials)');
}

// In-memory fallback data store for instant testing
let memoryDb = {
  transactions: [
    { id: '1', type: 'INCOME', amount: 8000, title: 'Monthly Pocket Money from Parents', category: 'Pocket Money', payment_app: 'Bank Transfer', transaction_date: new Date(Date.now() - 172800000).toISOString().split('T')[0] },
    { id: '2', type: 'INCOME', amount: 5000, title: 'National Merit Scholarship Credit', category: 'Scholarship', payment_app: 'Bank Transfer', transaction_date: new Date(Date.now() - 172800000).toISOString().split('T')[0] },
    { id: '3', type: 'EXPENSE', amount: 160, title: 'Zomato Biryani Lunch', category: 'Food & Canteen', payment_app: 'Google Pay', transaction_date: new Date().toISOString().split('T')[0] },
    { id: '4', type: 'EXPENSE', amount: 40, title: 'Chai & Samosa Tapri', category: 'Food & Canteen', payment_app: 'Paytm', transaction_date: new Date().toISOString().split('T')[0] },
    { id: '5', type: 'EXPENSE', amount: 50, title: 'Metro Smart Card Recharge', category: 'Travel & Metro', payment_app: 'PhonePe', transaction_date: new Date().toISOString().split('T')[0] },
    { id: '6', type: 'EXPENSE', amount: 450, title: 'Data Structures Textbook', category: 'Education & Books', payment_app: 'Google Pay', transaction_date: new Date(Date.now() - 86400000).toISOString().split('T')[0] },
    { id: '7', type: 'EXPENSE', amount: 2500, title: 'Hostel Mess & Maintenance Fee', category: 'Hostel & Rent', payment_app: 'Google Pay', transaction_date: new Date(Date.now() - 172800000).toISOString().split('T')[0] },
    { id: '8', type: 'EXPENSE', amount: 299, title: 'Spotify Student Subscription', category: 'Entertainment', payment_app: 'PhonePe', transaction_date: new Date(Date.now() - 86400000).toISOString().split('T')[0] }
  ],
  goals: [
    { id: 'g1', title: 'MacBook Air M3 Fund', target_amount: 75000, current_saved: 22000, deadline: '2027-04-30' },
    { id: 'g2', title: 'Fullstack Web Dev Bootcamp', target_amount: 6000, current_saved: 4200, deadline: '2026-12-15' },
    { id: 'g3', title: 'Manali Semester Trip', target_amount: 12000, current_saved: 5500, deadline: '2027-01-20' }
  ],
  limits: {
    monthly: 9000,
    daily: 350
  }
};

// UPI Parser Engine
function parseUpiText(text) {
  const cleanText = text.trim();
  const amtMatch = cleanText.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) || 
                   cleanText.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:debited|credited|paid|transferred)/i);
  
  if (!amtMatch) return null;
  const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const isIncome = /(?:credited|received|added|scholarship|allowance)/i.test(cleanText);

  let paymentApp = 'UPI';
  if (/gpay|google\s*pay/i.test(cleanText)) paymentApp = 'Google Pay';
  else if (/phonepe/i.test(cleanText)) paymentApp = 'PhonePe';
  else if (/paytm/i.test(cleanText)) paymentApp = 'Paytm';
  else if (/bhim/i.test(cleanText)) paymentApp = 'BHIM UPI';
  else if (/sbi|hdfc|icici|axis|pnb|bob/i.test(cleanText)) paymentApp = 'Bank Transfer';

  let category = isIncome ? 'Income' : 'Other';
  let title = 'UPI Payment';

  if (isIncome) {
    if (/scholarship/i.test(cleanText)) category = 'Scholarship';
    else if (/pocket|parents|mom|dad/i.test(cleanText)) category = 'Pocket Money';
    title = 'Allowance / Income Received';
  } else {
    if (/swiggy|zomato|canteen|chai|tea|cafe|mcdonald|food|dinner|lunch|breakfast|tapri/i.test(cleanText)) {
      category = 'Food & Canteen';
      title = 'Food & Snacks';
    } else if (/metro|uber|ola|rapido|bus|auto|irctc|train|petrol/i.test(cleanText)) {
      category = 'Travel & Metro';
      title = 'Transit / Metro Ride';
    } else if (/book|xerox|print|udemy|coursera|college|tuition|fee|stationery/i.test(cleanText)) {
      category = 'Education & Books';
      title = 'Study Materials / Books';
    } else if (/rent|pg|hostel|electricity|room/i.test(cleanText)) {
      category = 'Hostel & Rent';
      title = 'Hostel / Room Rent';
    } else if (/amazon|flipkart|myntra|blinkit|zepto|instamart/i.test(cleanText)) {
      category = 'Shopping & Essentials';
      title = 'Shopping & Essentials';
    } else if (/movie|netflix|spotify|prime|gaming|recharge/i.test(cleanText)) {
      category = 'Entertainment';
      title = 'Entertainment & Subscription';
    }
  }

  const toMatch = cleanText.match(/(?:to|at|vpa)\s+([A-Za-z0-9\s&]+?)(?:\s+on|\s+ref|\s+via|\.|$)/i);
  if (toMatch && toMatch[1].trim().length > 1) {
    title = toMatch[1].trim().slice(0, 35);
  }

  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
    type: isIncome ? 'INCOME' : 'EXPENSE',
    amount,
    title,
    category,
    payment_app: paymentApp,
    transaction_date: new Date().toISOString().split('T')[0],
    raw_upi_sms: cleanText
  };
}

// ---------------- API ROUTES ----------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    database: isSupabaseConfigured ? 'Supabase Cloud' : 'Local Memory Store',
    timestamp: new Date().toISOString()
  });
});

// 2. Authentication: Register (Sign Up)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, collegeName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || 'Student',
            college_name: collegeName || ''
          }
        }
      });
      if (error) throw error;
      return res.status(201).json({
        success: true,
        user: data.user,
        session: data.session,
        message: 'Account created successfully!'
      });
    } else {
      const mockUser = {
        id: 'usr_' + Date.now(),
        email,
        user_metadata: { full_name: fullName || 'Student', college_name: collegeName || '' }
      };
      return res.status(201).json({
        success: true,
        user: mockUser,
        message: 'Account created in demo mode!'
      });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: err.message });
  }
});

// 3. Authentication: Login (Sign In)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return res.json({
        success: true,
        user: data.user,
        session: data.session,
        message: 'Logged in successfully!'
      });
    } else {
      const mockUser = {
        id: 'usr_demo',
        email,
        user_metadata: { full_name: email.split('@')[0] }
      };
      return res.json({
        success: true,
        user: mockUser,
        message: 'Logged in in demo mode!'
      });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({ error: err.message });
  }
});

// 4. UPI SMS Parser & Logger
app.post('/api/upi/parse-and-log', async (req, res) => {
  try {
    const { rawText, userId } = req.body;
    if (!rawText) return res.status(400).json({ error: 'rawText is required' });

    const lines = rawText.split('\n').filter(l => l.trim().length > 0);
    const parsedItems = [];

    lines.forEach(line => {
      const p = parseUpiText(line);
      if (p) {
        if (userId) p.user_id = userId;
        parsedItems.push(p);
      }
    });

    if (parsedItems.length === 0) {
      return res.status(422).json({ error: 'Could not extract valid amount from input text.' });
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('transactions').insert(parsedItems).select();
      if (error) throw error;
      return res.status(201).json({ success: true, count: data.length, data });
    } else {
      memoryDb.transactions = [...parsedItems, ...memoryDb.transactions];
      return res.status(201).json({ success: true, count: parsedItems.length, data: parsedItems });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Transactions CRUD
app.get('/api/transactions', async (req, res) => {
  try {
    const { category, userId } = req.query;

    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('transactions').select('*').order('transaction_date', { ascending: false });
      if (userId) q = q.eq('user_id', userId);
      if (category && category !== 'ALL') q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      let list = memoryDb.transactions;
      if (category && category !== 'ALL') {
        list = list.filter(t => t.category === category);
      }
      return res.json({ success: true, data: list });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const tx = {
      id: Date.now().toString(),
      type: req.body.type || 'EXPENSE',
      amount: parseFloat(req.body.amount),
      title: req.body.title,
      category: req.body.category || 'Other',
      payment_app: req.body.payment_app || 'UPI',
      transaction_date: req.body.transaction_date || new Date().toISOString().split('T')[0]
    };

    if (isSupabaseConfigured && supabase) {
      if (req.body.userId) tx.user_id = req.body.userId;
      const { data, error } = await supabase.from('transactions').insert([tx]).select();
      if (error) throw error;
      return res.status(201).json({ success: true, data: data[0] });
    } else {
      memoryDb.transactions.unshift(tx);
      return res.status(201).json({ success: true, data: tx });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    } else {
      memoryDb.transactions = memoryDb.transactions.filter(t => t.id !== id);
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Dashboard Analytics & Forecasting
app.get('/api/dashboard/analytics', async (req, res) => {
  try {
    const { userId } = req.query;
    let txList = [];
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('transactions').select('*');
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      txList = data || [];
    } else {
      txList = memoryDb.transactions;
    }

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysRemaining = Math.max(1, daysInMonth - dayOfMonth);
    const todayStr = now.toISOString().split('T')[0];

    let totalInflow = 0;
    let totalExpense = 0;
    let todayExpense = 0;
    const categoryTotals = {};

    txList.forEach(t => {
      const amt = parseFloat(t.amount);
      if (t.type === 'INCOME') {
        totalInflow += amt;
      } else {
        totalExpense += amt;
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + amt;
        if (t.transaction_date === todayStr) {
          todayExpense += amt;
        }
      }
    });

    const balance = totalInflow - totalExpense;
    const dailyBurnRate = dayOfMonth > 0 ? (totalExpense / dayOfMonth) : 0;
    const projectedSavings = totalInflow - (totalExpense + (dailyBurnRate * daysRemaining));

    res.json({
      success: true,
      data: {
        balance,
        totalInflow,
        totalExpense,
        todayExpense,
        dailyBurnRate: Math.round(dailyBurnRate),
        daysRemaining,
        projectedMonthEndSavings: Math.round(projectedSavings),
        isDeficit: projectedSavings < 0,
        categoryTotals,
        limits: memoryDb.limits
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Savings Goals
app.get('/api/goals', async (req, res) => {
  try {
    const { userId } = req.query;
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('savings_goals').select('*').order('created_at', { ascending: true });
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      return res.json({ success: true, data: memoryDb.goals });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    const goal = {
      id: 'g_' + Date.now(),
      title: req.body.title,
      target_amount: parseFloat(req.body.target_amount),
      current_saved: parseFloat(req.body.current_saved || 0),
      deadline: req.body.deadline
    };

    if (isSupabaseConfigured && supabase) {
      if (req.body.userId) goal.user_id = req.body.userId;
      const { data, error } = await supabase.from('savings_goals').insert([goal]).select();
      if (error) throw error;
      return res.status(201).json({ success: true, data: data[0] });
    } else {
      memoryDb.goals.push(goal);
      return res.status(201).json({ success: true, data: goal });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/goals/:id/deposit', async (req, res) => {
  try {
    const { id } = req.params;
    const amt = parseFloat(req.body.amount);

    if (isSupabaseConfigured && supabase) {
      const { data: g, error: ge } = await supabase.from('savings_goals').select('*').eq('id', id).single();
      if (ge) throw ge;
      const updated = Number(g.current_saved) + amt;
      const { data, error } = await supabase.from('savings_goals').update({ current_saved: updated }).eq('id', id).select();
      if (error) throw error;
      return res.json({ success: true, data: data[0] });
    } else {
      const goal = memoryDb.goals.find(g => g.id === id);
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      goal.current_saved += amt;
      memoryDb.transactions.unshift({
        id: Date.now().toString(),
        type: 'EXPENSE',
        amount: amt,
        title: `Savings: ${goal.title}`,
        category: 'Savings Deposit',
        payment_app: 'Goal Transfer',
        transaction_date: new Date().toISOString().split('T')[0]
      });
      return res.json({ success: true, data: goal });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export app for Vercel Serverless Function
module.exports = app;

// Listen locally if not in Vercel serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 CampusSpend Backend listening on http://localhost:${PORT}`);
  });
}
