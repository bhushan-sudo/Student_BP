// api.js - Frontend to Backend REST API Bridge
const API_BASE_URL = 'http://localhost:5000/api';

export const Api = {
  // Check if backend server is online
  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  // 1. Parse & Log UPI SMS via Backend Engine
  async parseAndLogUpi(rawText, userId = null) {
    const res = await fetch(`${API_BASE_URL}/upi/parse-and-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, userId })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to parse UPI');
    return await res.json();
  },

  // 2. Fetch Transactions from Database
  async getTransactions(category = 'ALL', userId = null) {
    let url = `${API_BASE_URL}/transactions?category=${encodeURIComponent(category)}`;
    if (userId) url += `&userId=${userId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    const json = await res.json();
    return json.data || [];
  },

  // 3. Create a Single Transaction
  async createTransaction(txData) {
    const res = await fetch(`${API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData)
    });
    if (!res.ok) throw new Error('Failed to create transaction');
    const json = await res.json();
    return json.data;
  },

  // 4. Delete Transaction
  async deleteTransaction(id) {
    const res = await fetch(`${API_BASE_URL}/transactions/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete transaction');
    return await res.json();
  },

  // 5. Fetch Dashboard Analytics & Month-End Forecast
  async getAnalytics(userId = null) {
    let url = `${API_BASE_URL}/dashboard/analytics`;
    if (userId) url += `?userId=${userId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    const json = await res.json();
    return json.data;
  },

  // 6. Savings Goals
  async getGoals(userId = null) {
    let url = `${API_BASE_URL}/goals`;
    if (userId) url += `?userId=${userId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch goals');
    const json = await res.json();
    return json.data || [];
  },

  async createGoal(goalData) {
    const res = await fetch(`${API_BASE_URL}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData)
    });
    if (!res.ok) throw new Error('Failed to create goal');
    const json = await res.json();
    return json.data;
  },

  async depositGoal(goalId, amount, userId = null) {
    const res = await fetch(`${API_BASE_URL}/goals/${goalId}/deposit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, userId })
    });
    if (!res.ok) throw new Error('Failed to deposit funds');
    const json = await res.json();
    return json.data;
  }
};