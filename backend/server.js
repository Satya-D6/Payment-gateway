const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Database Connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============ VALIDATION LOGIC ============

// VPA Validation: ^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$
const validateVPA = (vpa) => {
    if (!vpa || typeof vpa !== 'string') return false;
    return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(vpa);
};

// Luhn Algorithm Validation
const validateCardLuhn = (cardNumber) => {
    if (!cardNumber || typeof cardNumber !== 'string') return false;
    const cleaned = cardNumber.replace(/[\s\-]/g, '');
    if (!/^\d{13,19}$/.test(cleaned)) return false;
    
    let digits = cleaned.split('').map(Number).reverse();
    let sum = digits.reduce((acc, digit, i) => {
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        return acc + digit;
    }, 0);
    return sum % 10 === 0;
};

// Card Network Detection
const detectCardNetwork = (cardNumber) => {
    if (!cardNumber) return 'unknown';
    const cleaned = cardNumber.replace(/[\s\-]/g, '');
    
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^(60|65|8[1-9])/.test(cleaned)) return 'rupay';
    return 'unknown';
};

// Expiry Date Validation
const validateExpiry = (month, year) => {
    const monthNum = parseInt(month);
    if (monthNum < 1 || monthNum > 12) return false;
    
    let yearNum = parseInt(year);
    if (year.length === 2) {
        yearNum = 2000 + yearNum;
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    if (yearNum < currentYear) return false;
    if (yearNum === currentYear && monthNum < currentMonth) return false;
    
    return true;
};

// Generate Unique ID
const generateId = (prefix, length = 16) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < length; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix + id;
};

// ============ MIDDLEWARE ============

// Authentication Middleware
const authenticateAPI = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    if (!apiKey || !apiSecret) {
        return res.status(401).json({
            error: {
                code: 'AUTHENTICATION_ERROR',
                description: 'Invalid API credentials'
            }
        });
    }
    
    try {
        const result = await pool.query(
            'SELECT id FROM merchants WHERE api_key = $1 AND api_secret = $2',
            [apiKey, apiSecret]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                error: {
                    code: 'AUTHENTICATION_ERROR',
                    description: 'Invalid API credentials'
                }
            });
        }
        
        req.merchantId = result.rows[0].id;
        next();
    } catch (err) {
        console.error('Auth error:', err);
        res.status(401).json({
            error: {
                code: 'AUTHENTICATION_ERROR',
                description: 'Invalid API credentials'
            }
        });
    }
};

// ============ SEED MERCHANT ============

const seedMerchant = async () => {
    try {
        const query = `
            INSERT INTO merchants (id, name, email, api_key, api_secret, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO NOTHING;
        `;
        await pool.query(query, [
            '550e8400-e29b-41d4-a716-446655440000',
            'Test Merchant',
            'test@example.com',
            'key_test_abc123',
            'secret_test_xyz789',
            true
        ]);
        console.log('Merchant seeded successfully');
    } catch (err) {
        console.error('Error seeding merchant:', err);
    }
};

// ============ ENDPOINTS ============

// 1. Health Check (No Auth Required)
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            timestamp: new Date().toISOString()
        });
    }
});

// 2. Test Merchant Endpoint (No Auth Required)
app.get('/api/v1/test/merchant', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, api_key FROM merchants WHERE email = $1',
            ['test@example.com']
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Test merchant not found'
                }
            });
        }
        
        res.status(200).json({
            id: result.rows[0].id,
            email: result.rows[0].email,
            api_key: result.rows[0].api_key,
            seeded: true
        });
    } catch (err) {
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 3. Create Order (Auth Required)
app.post('/api/v1/orders', authenticateAPI, async (req, res) => {
    const { amount, currency = 'INR', receipt, notes } = req.body;
    
    // Validate amount
    if (!amount || typeof amount !== 'number' || amount < 100) {
        return res.status(400).json({
            error: {
                code: 'BAD_REQUEST_ERROR',
                description: 'amount must be at least 100'
            }
        });
    }
    
    try {
        const orderId = generateId('order_');
        const query = `
            INSERT INTO orders (id, merchant_id, amount, currency, receipt, notes, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'created', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, merchant_id, amount, currency, receipt, notes, status, created_at, updated_at;
        `;
        
        const result = await pool.query(query, [
            orderId,
            req.merchantId,
            amount,
            currency,
            receipt || null,
            notes ? JSON.stringify(notes) : null
        ]);
        
        const order = result.rows[0];
        res.status(201).json({
            id: order.id,
            merchant_id: order.merchant_id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            notes: order.notes ? JSON.parse(order.notes) : {},
            status: order.status,
            created_at: order.created_at.toISOString(),
            updated_at: order.updated_at.toISOString()
        });
    } catch (err) {
        console.error('Create order error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 4. Get Order (Auth Required)
app.get('/api/v1/orders/:order_id', authenticateAPI, async (req, res) => {
    const { order_id } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2',
            [order_id, req.merchantId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Order not found'
                }
            });
        }
        
        const order = result.rows[0];
        res.status(200).json({
            id: order.id,
            merchant_id: order.merchant_id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            notes: order.notes ? JSON.parse(order.notes) : {},
            status: order.status,
            created_at: order.created_at.toISOString(),
            updated_at: order.updated_at.toISOString()
        });
    } catch (err) {
        console.error('Get order error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 5. Get Order (Public - No Auth Required)
app.get('/api/v1/orders/:order_id/public', async (req, res) => {
    const { order_id } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT id, amount, currency, status FROM orders WHERE id = $1',
            [order_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Order not found'
                }
            });
        }
        
        const order = result.rows[0];
        res.status(200).json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            status: order.status
        });
    } catch (err) {
        console.error('Get public order error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 6. Create Payment (Auth Required)
app.post('/api/v1/payments', authenticateAPI, async (req, res) => {
    const { order_id, method, vpa, card } = req.body;
    const testMode = process.env.TEST_MODE === 'true';
    const testPaymentSuccess = process.env.TEST_PAYMENT_SUCCESS !== 'false';
    const testProcessingDelay = parseInt(process.env.TEST_PROCESSING_DELAY) || 1000;
    
    try {
        // Verify order exists and belongs to merchant
        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2',
            [order_id, req.merchantId]
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Order not found'
                }
            });
        }
        
        const order = orderResult.rows[0];
        let cardNetwork = null;
        let cardLast4 = null;
        let errorCode = null;
        let errorDescription = null;
        let paymentStatus = 'processing';
        
        // Validate based on payment method
        if (method === 'upi') {
            if (!vpa) {
                return res.status(400).json({
                    error: {
                        code: 'BAD_REQUEST_ERROR',
                        description: 'VPA is required for UPI payments'
                    }
                });
            }
            if (!validateVPA(vpa)) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_VPA',
                        description: 'Invalid VPA format'
                    }
                });
            }
        } else if (method === 'card') {
            if (!card) {
                return res.status(400).json({
                    error: {
                        code: 'BAD_REQUEST_ERROR',
                        description: 'Card details are required'
                    }
                });
            }
            
            const { number, expiry_month, expiry_year, cvv, holder_name } = card;
            
            if (!number || !expiry_month || !expiry_year || !cvv || !holder_name) {
                return res.status(400).json({
                    error: {
                        code: 'BAD_REQUEST_ERROR',
                        description: 'All card fields are required'
                    }
                });
            }
            
            if (!validateCardLuhn(number)) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_CARD',
                        description: 'Invalid card number'
                    }
                });
            }
            
            if (!validateExpiry(expiry_month, expiry_year)) {
                return res.status(400).json({
                    error: {
                        code: 'EXPIRED_CARD',
                        description: 'Card has expired'
                    }
                });
            }
            
            cardNetwork = detectCardNetwork(number);
            cardLast4 = number.slice(-4);
        } else {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Invalid payment method'
                }
            });
        }
        
        // Create payment record
        const paymentId = generateId('pay_');
        const insertQuery = `
            INSERT INTO payments (
                id, order_id, merchant_id, amount, currency, method, status, 
                vpa, card_network, card_last4, error_code, error_description,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *;
        `;
        
        const paymentResult = await pool.query(insertQuery, [
            paymentId,
            order_id,
            req.merchantId,
            order.amount,
            order.currency,
            method,
            paymentStatus,
            method === 'upi' ? vpa : null,
            method === 'card' ? cardNetwork : null,
            method === 'card' ? cardLast4 : null,
            errorCode,
            errorDescription
        ]);
        
        const payment = paymentResult.rows[0];
        
        // Immediately return with processing status
        const responsePayload = {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            created_at: payment.created_at.toISOString()
        };
        
        if (method === 'upi') {
            responsePayload.vpa = payment.vpa;
        } else if (method === 'card') {
            responsePayload.card_network = payment.card_network;
            responsePayload.card_last4 = payment.card_last4;
        }
        
        res.status(201).json(responsePayload);
        
        // Process payment asynchronously in background
        (async () => {
            try {
                // Add processing delay
                const delay = testMode ? testProcessingDelay : (Math.random() * 5000 + 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Determine success/failure
                let isSuccess;
                if (testMode) {
                    isSuccess = testPaymentSuccess;
                } else {
                    const successRate = method === 'upi' ? 0.90 : 0.95;
                    isSuccess = Math.random() < successRate;
                }
                
                // Update payment status
                if (isSuccess) {
                    await pool.query(
                        'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        ['success', paymentId]
                    );
                } else {
                    const errorCodeValue = method === 'upi' ? 'PAYMENT_FAILED_UPI' : 'PAYMENT_FAILED_CARD';
                    const errorDescValue = 'Payment processing failed. Please try again.';
                    await pool.query(
                        'UPDATE payments SET status = $1, error_code = $2, error_description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
                        ['failed', errorCodeValue, errorDescValue, paymentId]
                    );
                }
            } catch (err) {
                console.error('Error processing payment:', err);
            }
        })();
        
    } catch (err) {
        console.error('Create payment error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 7. Create Payment (Public - No Auth Required)
app.post('/api/v1/payments/public', async (req, res) => {
    const { order_id, method, vpa, card } = req.body;
    const testMode = process.env.TEST_MODE === 'true';
    const testPaymentSuccess = process.env.TEST_PAYMENT_SUCCESS !== 'false';
    const testProcessingDelay = parseInt(process.env.TEST_PROCESSING_DELAY) || 1000;
    
    try {
        // Verify order exists
        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1',
            [order_id]
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Order not found'
                }
            });
        }
        
        const order = orderResult.rows[0];
        let cardNetwork = null;
        let cardLast4 = null;
        let errorCode = null;
        let errorDescription = null;
        let paymentStatus = 'processing';
        
        // Validate based on payment method
        if (method === 'upi') {
            if (!vpa || !validateVPA(vpa)) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_VPA',
                        description: 'Invalid VPA format'
                    }
                });
            }
        } else if (method === 'card') {
            if (!card) {
                return res.status(400).json({
                    error: {
                        code: 'BAD_REQUEST_ERROR',
                        description: 'Card details are required'
                    }
                });
            }
            
            const { number, expiry_month, expiry_year, cvv, holder_name } = card;
            
            if (!number || !expiry_month || !expiry_year || !cvv || !holder_name) {
                return res.status(400).json({
                    error: {
                        code: 'BAD_REQUEST_ERROR',
                        description: 'All card fields are required'
                    }
                });
            }
            
            if (!validateCardLuhn(number)) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_CARD',
                        description: 'Invalid card number'
                    }
                });
            }
            
            if (!validateExpiry(expiry_month, expiry_year)) {
                return res.status(400).json({
                    error: {
                        code: 'EXPIRED_CARD',
                        description: 'Card has expired'
                    }
                });
            }
            
            cardNetwork = detectCardNetwork(number);
            cardLast4 = number.slice(-4);
        } else {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Invalid payment method'
                }
            });
        }
        
        // Create payment record
        const paymentId = generateId('pay_');
        const insertQuery = `
            INSERT INTO payments (
                id, order_id, merchant_id, amount, currency, method, status, 
                vpa, card_network, card_last4, error_code, error_description,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *;
        `;
        
        const paymentResult = await pool.query(insertQuery, [
            paymentId,
            order_id,
            order.merchant_id,
            order.amount,
            order.currency,
            method,
            paymentStatus,
            method === 'upi' ? vpa : null,
            method === 'card' ? cardNetwork : null,
            method === 'card' ? cardLast4 : null,
            errorCode,
            errorDescription
        ]);
        
        const payment = paymentResult.rows[0];
        
        const responsePayload = {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            created_at: payment.created_at.toISOString()
        };
        
        if (method === 'upi') {
            responsePayload.vpa = payment.vpa;
        } else if (method === 'card') {
            responsePayload.card_network = payment.card_network;
            responsePayload.card_last4 = payment.card_last4;
        }
        
        res.status(201).json(responsePayload);
        
        // Process payment asynchronously in background
        (async () => {
            try {
                const delay = testMode ? testProcessingDelay : (Math.random() * 5000 + 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                let isSuccess;
                if (testMode) {
                    isSuccess = testPaymentSuccess;
                } else {
                    const successRate = method === 'upi' ? 0.90 : 0.95;
                    isSuccess = Math.random() < successRate;
                }
                
                if (isSuccess) {
                    await pool.query(
                        'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        ['success', paymentId]
                    );
                } else {
                    const errorCodeValue = method === 'upi' ? 'PAYMENT_FAILED_UPI' : 'PAYMENT_FAILED_CARD';
                    const errorDescValue = 'Payment processing failed. Please try again.';
                    await pool.query(
                        'UPDATE payments SET status = $1, error_code = $2, error_description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
                        ['failed', errorCodeValue, errorDescValue, paymentId]
                    );
                }
            } catch (err) {
                console.error('Error processing payment:', err);
            }
        })();
        
    } catch (err) {
        console.error('Create public payment error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 8. Get Payment (Auth Required)
app.get('/api/v1/payments/:payment_id', authenticateAPI, async (req, res) => {
    const { payment_id } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM payments WHERE id = $1 AND merchant_id = $2',
            [payment_id, req.merchantId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Payment not found'
                }
            });
        }
        
        const payment = result.rows[0];
        const responsePayload = {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            created_at: payment.created_at.toISOString(),
            updated_at: payment.updated_at.toISOString()
        };
        
        if (payment.vpa) responsePayload.vpa = payment.vpa;
        if (payment.card_network) responsePayload.card_network = payment.card_network;
        if (payment.card_last4) responsePayload.card_last4 = payment.card_last4;
        if (payment.error_code) responsePayload.error_code = payment.error_code;
        if (payment.error_description) responsePayload.error_description = payment.error_description;
        
        res.status(200).json(responsePayload);
    } catch (err) {
        console.error('Get payment error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 9. Get Payment (Public - No Auth Required)
app.get('/api/v1/payments/:payment_id/public', async (req, res) => {
    const { payment_id } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM payments WHERE id = $1',
            [payment_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Payment not found'
                }
            });
        }
        
        const payment = result.rows[0];
        const responsePayload = {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            created_at: payment.created_at.toISOString(),
            updated_at: payment.updated_at.toISOString()
        };
        
        if (payment.vpa) responsePayload.vpa = payment.vpa;
        if (payment.card_network) responsePayload.card_network = payment.card_network;
        if (payment.card_last4) responsePayload.card_last4 = payment.card_last4;
        
        res.status(200).json(responsePayload);
    } catch (err) {
        console.error('Get public payment error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 10. Login Endpoint (For Frontend)
app.post('/api/v1/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query(
            'SELECT id, api_key, api_secret FROM merchants WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                error: {
                    code: 'AUTHENTICATION_ERROR',
                    description: 'Invalid credentials'
                }
            });
        }
        
        res.status(200).json({
            merchant_id: result.rows[0].id,
            api_key: result.rows[0].api_key,
            api_secret: result.rows[0].api_secret
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 11. Get Merchant Stats (Auth Required)
app.get('/api/v1/merchant-stats', authenticateAPI, async (req, res) => {
    try {
        const totalPayments = await pool.query(
            'SELECT COUNT(*) as count FROM payments WHERE merchant_id = $1',
            [req.merchantId]
        );
        
        const totalAmount = await pool.query(
            'SELECT SUM(amount) as total FROM payments WHERE merchant_id = $1 AND status = $2',
            [req.merchantId, 'success']
        );
        
        const successCount = await pool.query(
            'SELECT COUNT(*) as count FROM payments WHERE merchant_id = $1 AND status = $2',
            [req.merchantId, 'success']
        );
        
        const count = totalPayments.rows[0].count || 0;
        const total = totalAmount.rows[0].total || 0;
        const success = successCount.rows[0].count || 0;
        const successRate = count > 0 ? Math.round((success / count) * 100) : 0;
        
        res.status(200).json({
            total_transactions: count,
            total_amount: total,
            success_rate: successRate
        });
    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// 12. Get Merchant Transactions (Auth Required)
app.get('/api/v1/transactions', authenticateAPI, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.id, p.order_id, p.amount, p.method, p.status, p.created_at 
             FROM payments p
             WHERE p.merchant_id = $1
             ORDER BY p.created_at DESC`,
            [req.merchantId]
        );
        
        const transactions = result.rows.map(row => ({
            id: row.id,
            order_id: row.order_id,
            amount: row.amount,
            method: row.method,
            status: row.status,
            created_at: row.created_at.toISOString()
        }));
        
        res.status(200).json(transactions);
    } catch (err) {
        console.error('Get transactions error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                description: 'Internal server error'
            }
        });
    }
});

// ============ START SERVER ============

const PORT = process.env.PORT || 8000;

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await seedMerchant();
});