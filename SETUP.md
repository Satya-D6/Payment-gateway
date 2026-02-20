# Setup and Testing Guide

## 📋 Prerequisites

Before starting, ensure you have installed:
- **Docker**: https://www.docker.com/products/docker-desktop
- **Docker Compose**: Usually included with Docker Desktop
- **Git**: https://git-scm.com/

To verify installation:
```bash
docker --version      # Should show Docker version
docker-compose --version  # Should show Docker Compose version
git --version         # Should show Git version
```

## 🚀 Installation Steps

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd payment-gateway
```

### Step 2: Start Services (One Command!)
```bash
docker-compose up -d
```

This command will automatically:
1. Download required Docker images
2. Create PostgreSQL database
3. Initialize database schema with test merchant
4. Build and start API server
5. Build and start Dashboard
6. Build and start Checkout page

### Step 3: Wait for Services to Start
```bash
# Wait 30-60 seconds for all services to initialize
# You can check status with:
docker-compose ps
```

Expected output:
```
NAME              STATUS
pg_gateway        Up (healthy)
gateway_api       Up
gateway_dashboard Up
gateway_checkout  Up
```

### Step 4: Verify Setup

**Check API Health**:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Check Test Merchant**:
```bash
curl http://localhost:8000/api/v1/test/merchant
```

Expected response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "api_key": "key_test_abc123",
  "seeded": true
}
```

## 🧪 Testing the Complete Flow

### Test 1: Merchant Login

1. Open http://localhost:3000
2. Login with credentials:
   - Email: `test@example.com`
   - Password: `anything` (password validation not required)
3. You should see your API credentials displayed

### Test 2: Create an Order via API

```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -d '{
    "amount": 50000,
    "currency": "INR",
    "receipt": "receipt_001"
  }'
```

Save the `order_id` from response (format: `order_XXXXXXXXXXXX`)

### Test 3: Complete Payment with UPI

Open the checkout page:
```
http://localhost:3001/checkout?order_id=ORDER_ID_FROM_ABOVE
```

In the checkout page:
1. Click "UPI" button
2. Enter VPA: `user@paytm`
3. Click "Pay ₹500"
4. Wait for payment processing (simulates 5-10 seconds)
5. Should see success or failure state

### Test 4: Complete Payment with Card

Open checkout page again with a new order:

1. Create another order (see Test 2)
2. Open checkout page
3. Click "Card" button
4. Fill in card details:
   - Card Number: `4111111111111111`
   - Expiry: `12/25`
   - CVV: `123`
   - Cardholder Name: `John Doe`
5. Click "Pay ₹500"
6. Wait for processing
7. Should see success or failure

### Test 5: View Transactions on Dashboard

1. Open http://localhost:3000
2. Login if not already logged in
3. Click "Transactions" tab
4. View all payments created above

## 🔧 Managing Services

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f postgres
```

### Stop Services
```bash
docker-compose stop
```

### Restart Services
```bash
docker-compose restart
```

### Stop and Remove Everything
```bash
docker-compose down
```

### Full Clean Slate (Delete Database)
```bash
docker-compose down -v
docker-compose up -d
```

## 🐛 Troubleshooting

### Issue: "Port already in use"
**Solution**: Change port in docker-compose.yml
```yaml
api:
  ports:
    - "8001:8000"  # Change 8000 to available port
```

### Issue: "Cannot connect to database"
**Solution**: Check if postgres service is healthy
```bash
docker-compose logs postgres
docker-compose restart postgres
# Wait 10 seconds, then check health again
curl http://localhost:8000/health
```

### Issue: Frontend shows blank page
**Solution**: Check if nginx is running properly
```bash
docker-compose logs dashboard
docker-compose logs checkout

# Restart if needed
docker-compose restart dashboard checkout
```

### Issue: API returns 401 Unauthorized
**Double-check headers**:
```bash
# Correct format (case-sensitive)
curl -H "X-Api-Key: key_test_abc123" \
     -H "X-Api-Secret: secret_test_xyz789" \
     http://localhost:8000/api/v1/test/merchant
```

### Issue: Payment never completes
**In test mode**, set shorter delays:
Edit docker-compose.yml:
```yaml
api:
  environment:
    TEST_MODE: "true"
    TEST_PROCESSING_DELAY: "2000"  # 2 seconds
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

## 📊 Testing API with Different Scenarios

### Scenario 1: Invalid VPA
```bash
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -d '{
    "order_id": "order_ABC123",
    "method": "upi",
    "vpa": "invalid vpa"
  }'
```

Expected: 400 error with INVALID_VPA code

### Scenario 2: Invalid Card Number
```bash
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -d '{
    "order_id": "order_ABC123",
    "method": "card",
    "card": {
      "number": "1234567890123456",
      "expiry_month": "12",
      "expiry_year": "2025",
      "cvv": "123",
      "holder_name": "John Doe"
    }
  }'
```

Expected: 400 error with INVALID_CARD code

### Scenario 3: Expired Card
```bash
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -d '{
    "order_id": "order_ABC123",
    "method": "card",
    "card": {
      "number": "4111111111111111",
      "expiry_month": "12",
      "expiry_year": "2020",
      "cvv": "123",
      "holder_name": "John Doe"
    }
  }'
```

Expected: 400 error with EXPIRED_CARD code

### Scenario 4: Invalid Amount
```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -d '{
    "amount": 50
  }'
```

Expected: 400 error with BAD_REQUEST_ERROR (amount must be at least 100)

## 📱 Supported Cards

These test card numbers work with valid Luhn algorithm:

| Network    | Card Number          |
|------------|----------------------|
| Visa       | 4111111111111111     |
| Mastercard | 5500000000000004     |
| Amex       | 378282246310005      |
| RuPay      | 6011111111111117     |

All test cards can use:
- Any expiry month (01-12)
- Any future expiry year
- Any 3-digit CVV
- Any cardholder name

## ✅ Quick Verification Checklist

After starting services, verify:

- [ ] Docker containers are running: `docker-compose ps`
- [ ] API is healthy: `curl http://localhost:8000/health`
- [ ] Test merchant exists: `curl http://localhost:8000/api/v1/test/merchant`
- [ ] Dashboard loads: `http://localhost:3000`
- [ ] Can login with test@example.com
- [ ] Checkout page loads: `http://localhost:3001`
- [ ] Can create orders via API with valid auth
- [ ] Can create payments via API
- [ ] Payments process and show status updates
- [ ] Transaction history shows in dashboard
- [ ] Invalid inputs return proper error codes

## 🔗 Quick Links

- **Dashboard**: http://localhost:3000
- **Checkout**: http://localhost:3001/checkout
- **API Docs**: See API Endpoints section in README.md
- **Logs**: `docker-compose logs -f`

## 💡 Tips

1. **Use Postman or curl** for API testing: Keep requests in a text file for easy reuse
2. **Monitor logs** while testing: `docker-compose logs -f api` in another terminal
3. **Test mode** for deterministic results: Set TEST_MODE=true for automated testing
4. **Database directly**: If needed, connect to PostgreSQL:
   ```bash
   # Inside container
   docker-compose exec postgres psql -U gateway_user -d payment_gateway
   ```

## 🆘 Need Help?

1. Check logs: `docker-compose logs -f`
2. Verify all services are running: `docker-compose ps`
3. Restart Docker: `docker-compose restart`
4. Full reset: `docker-compose down -v && docker-compose up -d`

---

**Remember**: Always use correct header names (case-sensitive): `X-Api-Key` and `X-Api-Secret`
