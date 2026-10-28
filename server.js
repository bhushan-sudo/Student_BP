require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  const origLookup = dns.lookup;
  dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (hostname && hostname.includes('supabase.co')) {
      dns.resolve4(hostname, (err, addrs) => {
        if (!err && addrs && addrs.length > 0) {
          if (options && options.all) {
            return callback(null, addrs.map(a => ({ address: a, family: 4 })));
          }
          return callback(null, addrs[0], 4);
        }
        origLookup(hostname, options, callback);
      });
    } else {
      origLookup(hostname, options, callback);
    }
  };
} catch (e) {
  // Graceful fallback
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, dashboard.html, database.html, api.js, icons, etc.)
app.use(express.static(path.join(__dirname)));

// Root route: serve landing page (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Dashboard route: serve dashboard.html
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Landing alias route
app.get('/landing', (req, res) => {
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
      let createdUser = null;
      let session = null;

      // 1. Attempt admin user creation so email is auto-confirmed immediately
      try {
        const { data: adminData, error: adminErr } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName || 'Student',
            college_name: collegeName || ''
          }
        });
        if (adminErr) throw adminErr;
        createdUser = adminData.user;
      } catch (adminErr) {
        // Fallback to standard signUp if admin API has any restrictions
        const { data: signData, error: signErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || 'Student',
              college_name: collegeName || ''
            }
          }
        });
        if (signErr) throw signErr;
        createdUser = signData.user;
        session = signData.session;
      }

      // 2. Guarantee profile row in public.profiles table
      if (createdUser) {
        try {
          await supabase.from('profiles').upsert({
            id: createdUser.id,
            email: createdUser.email,
            full_name: fullName || 'Student',
            college_name: collegeName || '',
            monthly_budget_limit: 8000.00,
            daily_budget_limit: 350.00,
            updated_at: new Date().toISOString()
          });
        } catch (profErr) {
          console.warn('Profile upsert warning:', profErr.message);
        }
      }

      return res.status(201).json({
        success: true,
        user: createdUser,
        session: session,
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

      // Fetch student profile settings (budget limits, college, name)
      let profile = null;
      try {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
        profile = p;
      } catch (pe) {}

      return res.json({
        success: true,
        user: data.user,
        profile,
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
      // In Supabase PostgreSQL, id is UUID DEFAULT uuid_generate_v4().
      // Do not send string ids to Postgres!
      const itemsToInsert = parsedItems.map(item => {
        const { id, ...rest } = item;
        return rest;
      });
      const { data, error } = await supabase.from('transactions').insert(itemsToInsert).select();
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


// 4B. Upload Bank / UPI Statement CSV with PostgreSQL Deduplication
app.post('/api/statements/upload-csv', async (req, res) => {
  try {
    const { csvData, userId } = req.body;
    if (!csvData) {
      return res.status(400).json({ error: 'csvData string or file content is required' });
    }

    const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file is empty or missing data rows' });
    }

    // 1. Detect Header Column Indexes
    const headerCols = lines[0].split(/[,\t]/).map(col => col.trim().toLowerCase().replace(/['"]/g, ''));
    let dateIdx = headerCols.findIndex(c => c.includes('date'));
    let descIdx = headerCols.findIndex(c => c.includes('desc') || c.includes('particular') || c.includes('narrat') || c.includes('title'));
    let amountIdx = headerCols.findIndex(c => c.includes('amount') || c.includes('debit') || c.includes('withdrawal'));

    if (dateIdx === -1) dateIdx = 0;
    if (descIdx === -1) descIdx = 1;
    if (amountIdx === -1) amountIdx = 2;

    const parsedRows = [];
    const currentYear = new Date().getFullYear();

    // 2. Parse and Validate Each Row
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 3) continue;

      const rawDate = cols[dateIdx] || '';
      const rawDesc = cols[descIdx] || 'Expense';
      const rawAmount = cols[amountIdx] || '0';

      const cleanAmt = parseFloat(rawAmount.replace(/[₹RsINR,\s]/gi, ''));
      if (isNaN(cleanAmt) || cleanAmt <= 0) continue;

      let txDate = new Date().toISOString().split('T')[0];
      try {
        const dateParts = rawDate.match(/(\d{1,2})\s+([A-Za-z]{3,9})/i);
        if (dateParts) {
          const day = dateParts[1].padStart(2, '0');
          const monthStr = dateParts[2];
          const monthIndex = new Date(`${monthStr} 1, 2000`).getMonth() + 1;
          const month = String(monthIndex).padStart(2, '0');
          txDate = `${currentYear}-${month}-${day}`;
        } else if (!isNaN(Date.parse(rawDate))) {
          txDate = new Date(rawDate).toISOString().split('T')[0];
        }
      } catch (e) {
        txDate = new Date().toISOString().split('T')[0];
      }

      const descLower = rawDesc.toLowerCase();
      let category = 'Other';
      let type = 'EXPENSE';

      if (/canteen|food|swiggy|zomato|chai|tea|cafe|lunch|dinner|breakfast|snack/i.test(descLower)) {
        category = 'Food & Canteen';
      } else if (/bus|metro|auto|rapido|uber|ola|train|irctc|fuel|petrol/i.test(descLower)) {
        category = 'Travel & Metro';
      } else if (/shopping|amazon|flipkart|myntra|blinkit|zepto/i.test(descLower)) {
        category = 'Shopping & Essentials';
      } else if (/book|xerox|college|tuition|fee|exam|stationery|udemy/i.test(descLower)) {
        category = 'Education & Books';
      } else if (/scholarship|pocket\s*money|allowance|salary|credit/i.test(descLower)) {
        category = 'Scholarship';
        type = 'INCOME';
      }

      parsedRows.push({
        user_id: userId || null,
        type,
        amount: cleanAmt,
        title: rawDesc,
        category,
        payment_app: 'Bank Statement (CSV)',
        transaction_date: txDate,
        raw_upi_sms: `CSV: ${rawDate} | ${rawDesc} | ₹${cleanAmt}`
      });
    }

    if (parsedRows.length === 0) {
      return res.status(422).json({ error: 'No valid transaction records found in the uploaded CSV.' });
    }

    // 3. PostgreSQL Deduplication & Database Storage
    let insertedRows = [];
    let duplicateCount = 0;

    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('transactions').select('transaction_date, amount, title');
      if (userId) q = q.eq('user_id', userId);
      const { data: existingRows } = await q;

      const existingSet = new Set(
        (existingRows || []).map(r => `${r.transaction_date}_${Number(r.amount)}_${r.title.toLowerCase().trim()}`)
      );

      const uniqueToInsert = parsedRows.filter(row => {
        const key = `${row.transaction_date}_${Number(row.amount)}_${row.title.toLowerCase().trim()}`;
        if (existingSet.has(key)) {
          duplicateCount++;
          return false;
        }
        existingSet.add(key);
        return true;
      });

      if (uniqueToInsert.length > 0) {
        const { data, error } = await supabase.from('transactions').insert(uniqueToInsert).select();
        if (error) throw error;
        insertedRows = data;
      }
    } else {
      const existingSet = new Set(
        memoryDb.transactions.map(r => `${r.transaction_date}_${Number(r.amount)}_${r.title.toLowerCase().trim()}`)
      );

      parsedRows.forEach(row => {
        const key = `${row.transaction_date}_${Number(row.amount)}_${row.title.toLowerCase().trim()}`;
        if (existingSet.has(key)) {
          duplicateCount++;
        } else {
          row.id = 'csv_' + Date.now() + Math.random().toString(36).substr(2, 4);
          memoryDb.transactions.unshift(row);
          insertedRows.push(row);
          existingSet.add(key);
        }
      });
    }

    return res.status(201).json({
      success: true,
      totalRows: parsedRows.length,
      importedCount: insertedRows.length,
      duplicateCount,
      data: insertedRows,
      message: `Successfully imported ${insertedRows.length} transactions (${duplicateCount} duplicates skipped).`
    });
  } catch (err) {
    console.error('Error importing statement CSV:', err);
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
    const isExpense = (req.body.type || 'EXPENSE').toUpperCase() === 'EXPENSE';
    const cleanAmount = parseFloat(req.body.amount);
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      return res.status(400).json({ error: 'A valid amount is required' });
    }

    if (isSupabaseConfigured && supabase) {
      const dbTx = {
        type: isExpense ? 'EXPENSE' : 'INCOME',
        amount: cleanAmount,
        title: req.body.title || (isExpense ? 'Expense' : 'Income'),
        category: req.body.category || 'Other',
        payment_app: req.body.payment_app || 'UPI',
        transaction_date: req.body.transaction_date || new Date().toISOString().split('T')[0]
      };
      if (req.body.userId) dbTx.user_id = req.body.userId;
      const { data, error } = await supabase.from('transactions').insert([dbTx]).select();
      if (error) throw error;
      return res.status(201).json({ success: true, data: data[0] });
    } else {
      const tx = {
        id: Date.now().toString(),
        type: isExpense ? 'EXPENSE' : 'INCOME',
        amount: cleanAmount,
        title: req.body.title || (isExpense ? 'Expense' : 'Income'),
        category: req.body.category || 'Other',
        payment_app: req.body.payment_app || 'UPI',
        transaction_date: req.body.transaction_date || new Date().toISOString().split('T')[0]
      };
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
    const targetAmt = parseFloat(req.body.target_amount);
    if (isNaN(targetAmt) || targetAmt <= 0) {
      return res.status(400).json({ error: 'Valid target amount is required' });
    }

    if (isSupabaseConfigured && supabase) {
      const dbGoal = {
        title: req.body.title || 'Savings Goal',
        target_amount: targetAmt,
        current_saved: parseFloat(req.body.current_saved || 0),
        deadline: req.body.deadline || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
      };
      if (req.body.userId) dbGoal.user_id = req.body.userId;
      const { data, error } = await supabase.from('savings_goals').insert([dbGoal]).select();
      if (error) throw error;
      return res.status(201).json({ success: true, data: data[0] });
    } else {
      const goal = {
        id: 'g_' + Date.now(),
        title: req.body.title,
        target_amount: targetAmt,
        current_saved: parseFloat(req.body.current_saved || 0),
        deadline: req.body.deadline
      };
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
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Valid deposit amount required' });
    }

    if (isSupabaseConfigured && supabase) {
      const { data: g, error: ge } = await supabase.from('savings_goals').select('*').eq('id', id).single();
      if (ge) throw ge;
      const updated = Number(g.current_saved) + amt;
      const { data, error } = await supabase.from('savings_goals').update({ current_saved: updated }).eq('id', id).select();
      if (error) throw error;

      // Also log deposit as transaction in Supabase
      try {
        await supabase.from('transactions').insert([{
          user_id: g.user_id || req.body.userId || null,
          type: 'EXPENSE',
          amount: amt,
          title: `Savings: ${g.title}`,
          category: 'Savings Deposit',
          payment_app: 'Goal Transfer',
          transaction_date: new Date().toISOString().split('T')[0]
        }]);
      } catch (txErr) {
        console.warn('Deposit tx log warning:', txErr.message);
      }

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
