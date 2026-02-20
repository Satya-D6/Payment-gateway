# Payment Gateway

A complete, production-ready payment gateway system with multi-method payment processing (UPI and Cards), merchant dashboard, and hosted checkout page. Built with Node.js backend, React dashboard, and vanilla JavaScript checkout page.

## Features

✅ **Dockerized Deployment** - Single command deployment with `docker-compose up -d`  
✅ **REST API** - Merchant authentication via API key/secret  
✅ **Multi-Method Processing** - UPI and Card payments with full validation  
✅ **Payment Validation** - VPA format validation, Luhn algorithm, card network detection, expiry validation  
✅ **Merchant Dashboard** - View API credentials, transaction statistics, and payment history  
✅ **Hosted Checkout** - Professional payment interface with real-time status updates  
✅ **Database Persistence** - PostgreSQL with proper schema and relationships  
✅ **Test Mode** - Deterministic payment outcomes for automated testing

## 🏗️ System Architecture

```
payment-gateway/
├── backend/                 # Node.js Express API
│   ├── server.js           # Main server with all endpoints
│   ├── package.json
│   ├── schema.sql          # Database schema
│   └── Dockerfile
├── frontend/               # React Dashboard
│   ├── src/
│   │   ├── App.js
│   │   ├── Login.js        # Merchant login page
│   │   ├── Home.js         # Dashboard with stats and transactions
│   │   └── *.css           # Styling
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── checkout-page/          # React Checkout Interface
│   ├── Checkout.js         # Main checkout component
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml      # Container orchestration
└── .env.example           # Environment variables template
```

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Git
- A terminal/command prompt

### Installation & Deployment

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd payment-gateway
   ```

2. **Configure environment** (optional):
   ```bash
   cp .env.example .env
   # Edit .env if needed for test mode or custom settings
   ```

3. **Start all services**:
   ```bash
   docker-compose up -d
   ```

   This single command will:
   - Start PostgreSQL database with automatic seeding
   - Start Node.js API server on port 8000
   - Start React Dashboard on port 3000
   - Start Checkout Page on port 3001

4. **Verify all services are running**:
   ```bash
   # Check health endpoint
   curl http://localhost:8000/health
   
   # Check test merchant
   curl http://localhost:8000/api/v1/test/merchant
   ```

5. **Access the applications**:
   - **Dashboard**: http://localhost:3000
   - **Checkout Page**: http://localhost:3001
   - **API**: http://localhost:8000

## 📋 API Endpoints

### Authentication
All endpoints except `/health` and `/api/v1/test/merchant` require authentication headers:
- `X-Api-Key`: API key
- `X-Api-Secret`: API secret

**Test Merchant Credentials**:
- API Key: `key_test_abc123`
- API Secret: `secret_test_xyz789`

### Health Check
```
GET /health
Response: { "status": "healthy", "database": "connected", "timestamp": "..." }
```

### Merchant Authentication
```
POST /api/v1/login
Body: { "email": "test@example.com", "password": "any" }
Response: { "merchant_id": "...", "api_key": "...", "api_secret": "..." }
```

### Order Management

**Create Order**:
```
POST /api/v1/orders
Headers: X-Api-Key, X-Api-Secret
Body: {
  "amount": 50000,        // in paise (100 minimum)
  "currency": "INR",      // optional, defaults to INR
  "receipt": "receipt_123", // optional
  "notes": { ... }        // optional JSON metadata
}
Response: { "id": "order_...", "merchant_id": "...", "amount": 50000, ... }
```

**Get Order**:
```
GET /api/v1/orders/{order_id}
Headers: X-Api-Key, X-Api-Secret
```

**Get Order (Public)** - No auth required:
```
GET /api/v1/orders/{order_id}/public
```

### Payment Processing

**Create Payment**:
```
POST /api/v1/payments
Headers: X-Api-Key, X-Api-Secret
Body (UPI): {
  "order_id": "order_...",
  "method": "upi",
  "vpa": "user@paytm"
}

Body (Card): {
  "order_id": "order_...",
  "method": "card",
  "card": {
    "number": "4111111111111111",
    "expiry_month": "12",
    "expiry_year": "2025",
    "cvv": "123",
    "holder_name": "John Doe"
  }
}
Response: { "id": "pay_...", "status": "processing", ... }
```

**Create Payment (Public)** - No auth required:
```
POST /api/v1/payments/public
```

**Get Payment**:
```
GET /api/v1/payments/{payment_id}
Headers: X-Api-Key, X-Api-Secret
```

**Get Payment (Public)** - No auth required:
```
GET /api/v1/payments/{payment_id}/public
```

### Merchant Dashboard

**Get Stats**:
```
GET /api/v1/merchant-stats
Headers: X-Api-Key, X-Api-Secret
Response: {
  "total_transactions": 100,
  "total_amount": 5000000,
  "success_rate": 95
}
```

**Get Transactions**:
```
GET /api/v1/transactions
Headers: X-Api-Key, X-Api-Secret
Response: [
  {
    "id": "pay_...",
    "order_id": "order_...",
    "amount": 50000,
    "method": "upi",
    "status": "success",
    "created_at": "..."
  },
  ...
]
```

## 🎨 Frontend Usage

### Dashboard Login
1. Open http://localhost:3000
2. Login with credentials:
   - Email: `test@example.com`
   - Password: (any password)
3. View your API credentials and transaction statistics

### Creating Test Payments

Using `curl`:
```bash
# Create an order
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -d '{
    "amount": 50000,
    "currency": "INR",
    "receipt": "receipt_123"
  }'

# Response will include order ID like: order_AbCdEfGhIjKlMnOp
# Then access checkout page
```

Then visit the checkout page:
```
http://localhost:3001/checkout?order_id=order_AbCdEfGhIjKlMnOp
```

## 🔐 Validation & Security

### VPA Validation (UPI)
- Format: `username@bank`
- Pattern: `^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$`
- Valid examples: `user@paytm`, `john.doe@okhdfcbank`

### Card Validation
- **Luhn Algorithm**: Validates card number authenticity
- **Network Detection**: Identifies Visa, Mastercard, Amex, RuPay
- **Expiry Validation**: Ensures card is not expired
- **Security**: Only stores last 4 digits, never stores CVV or full card number

Test Card Numbers:
- Visa: `4111111111111111`
- Mastercard: `5500000000000004`
- Amex: `378282246310005`

## 🧪 Test Mode

For deterministic testing, use environment variables:

```bash
# In docker-compose.yml or .env
TEST_MODE=true
TEST_PAYMENT_SUCCESS=true      # Force success (or false for failure)
TEST_PROCESSING_DELAY=1000      # Set exact delay in ms
```

This ensures:
- Predictable payment outcomes
- Fixed processing delays
- Consistent results for automated testing

## 📊 Database Schema

### Merchants Table
- `id` (UUID): Primary key
- `name` (varchar): Merchant name
- `email` (varchar): Unique email
- `api_key` (varchar): Unique API key
- `api_secret` (varchar): API secret
- `webhook_url` (text): Optional webhook URL
- `is_active` (boolean): Active status
- `created_at`, `updated_at` (timestamp)

### Orders Table
- `id` (varchar): Primary key (format: order_16alphanumeric)
- `merchant_id` (UUID): Foreign key to merchants
- `amount` (integer): Amount in paise (min 100)
- `currency` (varchar): Currency code (default: INR)
- `receipt` (varchar): Receipt identifier
- `notes` (JSONB): Metadata
- `status` (varchar): Order status
- `created_at`, `updated_at` (timestamp)

### Payments Table
- `id` (varchar): Primary key (format: pay_16alphanumeric)
- `order_id` (varchar): Foreign key to orders
- `merchant_id` (UUID): Foreign key to merchants
- `amount` (integer): Amount in paise
- `currency` (varchar): Currency code
- `method` (varchar): Payment method (upi or card)
- `status` (varchar): Status (processing, success, failed)
- `vpa` (varchar): UPI VPA (for UPI payments)
- `card_network` (varchar): Card network (for card payments)
- `card_last4` (varchar): Last 4 digits (for card payments)
- `error_code`, `error_description` (text): Error details
- `created_at`, `updated_at` (timestamp)

Indexes created on:
- `orders.merchant_id`
- `payments.order_id`
- `payments.status`

## 🔄 Payment Flow

1. **Order Creation** → Status: `created`
2. **Payment Initiation** → Status: `processing`
3. **Payment Processing** (5-10 second simulation)
4. **Payment Result** → Status: `success` or `failed`

Success Rates:
- UPI: 90% success rate
- Card: 95% success rate

## 🛠️ Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart
```

### Database connection fails
```bash
# Ensure database has initialized
docker-compose logs postgres

# Check health
curl http://localhost:8000/health
```

### Port conflicts
If ports 3000, 3001, 5432, or 8000 are in use:
```bash
# Edit docker-compose.yml and change port mappings
# Then restart
docker-compose down
docker-compose up -d
```

### Clear all data
```bash
docker-compose down -v
docker-compose up -d
# Database will be reseeded
```

## 📝 Environment Variables

See `.env.example` for all available options:

```
DATABASE_URL          # PostgreSQL connection string
PORT                  # API port (default: 8000)
TEST_MODE            # Enable test mode (true/false)
TEST_PAYMENT_SUCCESS # Force payment success in test mode
TEST_PROCESSING_DELAY # Set exact delay in milliseconds
```

## 🔗 Important API Response Format

All error responses follow this format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "description": "Human-readable description"
  }
}
```

Error Codes:
- `AUTHENTICATION_ERROR`: Invalid API credentials
- `BAD_REQUEST_ERROR`: Validation error
- `NOT_FOUND_ERROR`: Resource not found
- `INVALID_VPA`: Invalid UPI address
- `INVALID_CARD`: Invalid card number
- `EXPIRED_CARD`: Card expiry date invalid

## 📞 Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Verify endpoints are accessible
3. Ensure all services are running: `docker-compose ps`
4. Review API response format and error codes

## ✅ Verification Checklist

After deployment, verify:
- [ ] `GET /health` returns 200 with "healthy" status
- [ ] `GET /api/v1/test/merchant` returns test merchant details
- [ ] Dashboard accessible at http://localhost:3000
- [ ] Login works with test@example.com
- [ ] API endpoints respond to authenticated requests
- [ ] Checkout page loads with valid order_id parameter
- [ ] Payments process successfully or fail with proper error messages

## 📚 Additional Resources

- [API Documentation](./docs/API.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Database Schema](./docs/DATABASE.md)

---

**Built with**: Node.js, Express, React, PostgreSQL, Docker

**License**: MIT

**Version**: 1.0.0
