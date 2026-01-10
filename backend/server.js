const express = require('express');
const { Pool } = require('pg');

const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Database Connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1. Validation Logic: Luhn Algorithm for Cards
const validateCard = (number) => {
    let digits = number.replace(/\D/g, '').split('').map(Number);
    let sum = digits.reverse().reduce((acc, digit, i) => {
        if (i % 2 !== 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        return acc + digit;
    }, 0);
    return sum % 10 === 0;
};

// 2. Validation Logic: VPA (UPI) Format
const validateVPA = (vpa) => /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(vpa);

// 3. Helper: Generate Custom IDs (order_ or pay_)
const generateId = (prefix) => prefix + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

// 4. Health Check Endpoint
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: "healthy", database: "connected", timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: "unhealthy", database: "disconnected" });
    }
});

// Seed Merchant on Startup
const seedMerchant = async () => {
    const query = `
        INSERT INTO merchants (id, name, email, api_key, api_secret)
        VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Test Merchant', 'test@example.com', 'key_test_abc123', 'secret_test_xyz789')
        ON CONFLICT (email) DO NOTHING;
    `;
    await pool.query(query);
};
// 5. Create Order Route
app.post('/api/v1/orders', async (req, res) => {
    const { amount, currency, receipt, notes } = req.body;
    const apiKey = req.headers['x-api-key'];

    const merchant = await pool.query('SELECT id FROM merchants WHERE api_key = $1', [apiKey]);
    if (merchant.rows.length === 0) return res.status(401).json({ error: "Invalid API Key" });

    const orderId = generateId('order_');
    const query = 'INSERT INTO orders (id, merchant_id, amount, currency, receipt, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
    const values = [orderId, merchant.rows[0].id, amount, currency || 'INR', receipt, JSON.stringify(notes)];
    
    const newOrder = await pool.query(query, values);
    res.status(201).json(newOrder.rows[0]);
});

// 6. Create Payment Route (with Validation)
app.post('/api/v1/payments', async (req, res) => {
    const { order_id, method, card_number, vpa } = req.body;
    const paymentId = generateId('pay_');

    try {
        // 1. Validate payment details based on method
        if (method === 'card' && !validateCard(card_number)) return res.status(400).json({ error: "Invalid card" });
        if (method === 'upi' && !validateVPA(vpa)) return res.status(400).json({ error: "Invalid VPA" });

        // 2. Insert into payments table and update order status to 'captured'
        await pool.query('BEGIN');
        await pool.query('INSERT INTO payments (id, order_id, method, status, vpa) VALUES ($1, $2, $3, $4, $5)', [paymentId, order_id, method, 'captured', vpa]);
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['captured', order_id]);
        await pool.query('COMMIT');

        res.status(200).json({ id: paymentId, status: "captured" });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: "Payment failed" });
    }
});

app.post('/api/v1/login', async (req, res) => {
    const { email, password } = req.body;
    // For the task, we validate against the seeded merchant credentials
    const result = await pool.query('SELECT api_key, api_secret FROM merchants WHERE email = $1', [email]);
    
    if (result.rows.length > 0) {
        res.json({ api_key: result.rows[0].api_key, api_secret: result.rows[0].api_secret });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});
app.get('/api/merchants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT api_key, api_secret FROM merchants WHERE id = $1', [id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});
app.listen(8000, async () => {
    await seedMerchant();
    console.log('Server running on port 8000');
});