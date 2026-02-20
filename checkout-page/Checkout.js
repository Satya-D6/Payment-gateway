class Checkout {
  constructor() {
    this.orderId = new URLSearchParams(window.location.search).get('order_id');
    this.orderData = null;
    this.paymentData = null;
    this.selectedMethod = 'upi';
    this.init();
  }

  init() {
    if (!this.orderId) {
      this.showError('No order ID provided');
      return;
    }
    this.fetchOrderDetails();
    this.setupEventListeners();
  }

  async fetchOrderDetails() {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/orders/${this.orderId}/public`
      );
      if (!response.ok) throw new Error('Order not found');
      this.orderData = await response.json();
      this.render();
    } catch (error) {
      this.showError('Failed to load order. ' + error.message);
    }
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.dataset.method) {
        this.selectPaymentMethod(e.target.dataset.method);
      }
      if (e.target.dataset.testid === 'pay-button') {
        e.preventDefault();
        this.handlePayment();
      }
      if (e.target.dataset.testid === 'retry-button') {
        this.resetCheckout();
      }
    });
  }

  selectPaymentMethod(method) {
    this.selectedMethod = method;
    
    document.querySelectorAll('[data-method]').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.method === method) {
        btn.classList.add('active');
      }
    });

    document.querySelectorAll('[data-testid$="-form"]').forEach(form => {
      form.classList.remove('active');
    });
    const form = document.querySelector(`[data-testid="${method}-form"]`);
    if (form) form.classList.add('active');
  }

  async handlePayment() {
    const form = document.querySelector(
      `[data-testid="${this.selectedMethod}-form"]`
    );
    
    if (!this.validateForm(form)) return;

    this.showProcessing();

    try {
      const paymentPayload = await this.buildPaymentPayload();
      
      const response = await fetch(
        'http://localhost:8000/api/v1/payments/public',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.description || 'Payment creation failed'
        );
      }

      this.paymentData = await response.json();
      await this.pollPaymentStatus();
    } catch (error) {
      console.error('Payment error:', error);
      this.showError(error.message);
    }
  }

  validateForm(form) {
    const inputs = form.querySelectorAll('input');
    for (let input of inputs) {
      if (!input.value.trim()) {
        alert('Please fill all fields');
        return false;
      }
    }

    if (this.selectedMethod === 'card') {
      const cardNumber = form.querySelector('[data-testid="card-number-input"]').value;
      if (!this.validateLuhn(cardNumber)) {
        alert('Invalid card number');
        return false;
      }
    }

    return true;
  }

  validateLuhn(num) {
    const digits = num.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }

  async buildPaymentPayload() {
    if (this.selectedMethod === 'upi') {
      return {
        order_id: this.orderId,
        method: 'upi',
        vpa: document.querySelector('[data-testid="vpa-input"]').value
      };
    } else {
      const expiryInput = document.querySelector('[data-testid="expiry-input"]').value;
      const [month, year] = expiryInput.split('/');
      
      return {
        order_id: this.orderId,
        method: 'card',
        card: {
          number: document.querySelector('[data-testid="card-number-input"]').value,
          expiry_month: month,
          expiry_year: year,
          cvv: document.querySelector('[data-testid="cvv-input"]').value,
          holder_name: document.querySelector('[data-testid="cardholder-name-input"]').value
        }
      };
    }
  }

  async pollPaymentStatus() {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/payments/${this.paymentData.id}/public`
        );
        const payment = await response.json();

        if (payment.status === 'success') {
          this.showSuccess(payment);
          return;
        } else if (payment.status === 'failed') {
          this.showError(
            payment.error_description || 'Payment processing failed'
          );
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          this.showError('Payment processing timeout');
        }
      } catch (error) {
        console.error('Poll error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        }
      }
    };

    poll();
  }

  showProcessing() {
    document.querySelector('[data-testid="upi-form"]')?.classList.remove('active');
    document.querySelector('[data-testid="card-form"]')?.classList.remove('active');
    document.querySelector('[data-testid="processing-state"]').classList.add('active');
  }

  showSuccess(payment) {
    document.querySelector('[data-testid="processing-state"]').classList.remove('active');
    document.querySelector('[data-testid="success-state"]').classList.add('active');
    const paymentIdElement = document.querySelector('[data-testid="payment-id"]');
    if (paymentIdElement) paymentIdElement.textContent = payment.id;
  }

  showError(message) {
    document.querySelector('[data-testid="processing-state"]').classList.remove('active');
    document.querySelector('[data-testid="success-state"]').classList.remove('active');
    document.querySelector('[data-testid="error-state"]').classList.add('active');
    const errorElement = document.querySelector('[data-testid="error-message"]');
    if (errorElement) errorElement.textContent = message;
  }

  resetCheckout() {
    document.querySelector('[data-testid="error-state"]').classList.remove('active');
    document.querySelector('[data-testid="upi-form"]').classList.add('active');
    const form = document.querySelector('[data-testid="upi-form"]');
    if (form) form.reset();
    this.selectedMethod = 'upi';
  }

  render() {
    if (!this.orderData) return;

    const root = document.getElementById('root');
    const amountInRupees = (this.orderData.amount / 100).toFixed(2);

    root.innerHTML = `
      <div data-testid="checkout-container" class="checkout-container">
        <div data-testid="order-summary" class="order-summary">
          <h2>Complete Payment</h2>
          <div class="summary-row">
            <span>Order ID:</span>
            <span data-testid="order-id">${this.orderId}</span>
          </div>
          <div class="summary-row">
            <span>Amount:</span>
            <span data-testid="order-amount">₹${amountInRupees}</span>
          </div>
          <div class="summary-row">
            <span>Currency:</span>
            <span>${this.orderData.currency}</span>
          </div>
        </div>

        <div data-testid="payment-methods" class="payment-methods">
          <button 
            data-testid="method-upi" 
            data-method="upi" 
            class="method-btn active"
          >
            💳 UPI
          </button>
          <button 
            data-testid="method-card" 
            data-method="card" 
            class="method-btn"
          >
            💰 Card
          </button>
        </div>

        <!-- UPI Form -->
        <form data-testid="upi-form" class="payment-form active">
          <div class="form-group">
            <label for="vpa">Virtual Payment Address</label>
            <input
              data-testid="vpa-input"
              id="vpa"
              type="text"
              placeholder="username@bank"
              required
            />
          </div>
          <button data-testid="pay-button" type="button" class="pay-button">
            Pay ₹${amountInRupees}
          </button>
        </form>

        <!-- Card Form -->
        <form data-testid="card-form" class="payment-form">
          <div class="form-group">
            <label for="card-number">Card Number</label>
            <input
              data-testid="card-number-input"
              id="card-number"
              type="text"
              placeholder="4111 1111 1111 1111"
              required
            />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="expiry">Expiry (MM/YY)</label>
              <input
                data-testid="expiry-input"
                id="expiry"
                type="text"
                placeholder="12/25"
                required
              />
            </div>
            <div class="form-group">
              <label for="cvv">CVV</label>
              <input
                data-testid="cvv-input"
                id="cvv"
                type="text"
                placeholder="123"
                required
              />
            </div>
          </div>
          <div class="form-group">
            <label for="cardholder">Cardholder Name</label>
            <input
              data-testid="cardholder-name-input"
              id="cardholder"
              type="text"
              placeholder="John Doe"
              required
            />
          </div>
          <button data-testid="pay-button" type="button" class="pay-button">
            Pay ₹${amountInRupees}
          </button>
        </form>

        <!-- Processing State -->
        <div data-testid="processing-state" class="processing-state">
          <div class="spinner"></div>
          <p data-testid="processing-message" class="processing-message">
            Processing payment...
          </p>
        </div>

        <!-- Success State -->
        <div data-testid="success-state" class="success-state">
          <div class="checkmark">✓</div>
          <h2>Payment Successful!</h2>
          <div class="payment-details">
            <div class="detail-row">
              <span>Payment ID:</span>
              <span data-testid="payment-id"></span>
            </div>
            <div class="detail-row">
              <span>Amount:</span>
              <span>₹${amountInRupees}</span>
            </div>
          </div>
          <p data-testid="success-message" class="success-message">
            Your payment has been processed successfully
          </p>
        </div>

        <!-- Error State -->
        <div data-testid="error-state" class="error-state">
          <div class="error-icon">✗</div>
          <h2>Payment Failed</h2>
          <div data-testid="error-message" class="error-message"></div>
          <button data-testid="retry-button" class="retry-button">
            Try Again
          </button>
        </div>
      </div>
    `;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new Checkout();
  });
} else {
  new Checkout();
}