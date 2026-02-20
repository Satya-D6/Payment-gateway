import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Checkout.css';

function Checkout() {
  const [order, setOrder] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState('loading'); // loading, form, processing, success, error
  const [formData, setFormData] = useState({
    vpa: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    cardholderName: ''
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    
    if (!orderId) {
      setState('error');
      return;
    }

    fetchOrder(orderId);
  }, []);

  const fetchOrder = async (orderId) => {
    try {
      const response = await axios.get(`http://localhost:8000/api/v1/orders/${orderId}/public`);
      setOrder(response.data);
      setState('form');
    } catch (error) {
      console.error('Error fetching order:', error);
      setState('error');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    return '₹' + (amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    setState('processing');

    try {
      let paymentData = {
        order_id: order.id,
        method: selectedMethod
      };

      if (selectedMethod === 'upi') {
        paymentData.vpa = formData.vpa;
      } else if (selectedMethod === 'card') {
        paymentData.card = {
          number: formData.cardNumber,
          expiry_month: formData.expiryMonth,
          expiry_year: formData.expiryYear,
          cvv: formData.cvv,
          holder_name: formData.cardholderName
        };
      }

      const response = await axios.post('http://localhost:8000/api/v1/payments/public', paymentData);
      setPayment(response.data);

      // Poll for payment status
      pollPaymentStatus(response.data.id);
    } catch (error) {
      console.error('Payment error:', error);
      setState('error');
      setFormData(prev => ({
        ...prev,
        vpa: '',
        cardNumber: '',
        expiryMonth: '',
        expiryYear: '',
        cvv: '',
        cardholderName: ''
      }));
    }
  };

  const pollPaymentStatus = async (paymentId) => {
    const maxAttempts = 60; // 2 minutes with 2-second intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await axios.get(`http://localhost:8000/api/v1/payments/${paymentId}/public`);
        const paymentStatus = response.data.status;

        if (paymentStatus === 'success') {
          setPayment(response.data);
          setState('success');
        } else if (paymentStatus === 'failed') {
          setPayment(response.data);
          setState('error');
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 2000);
        } else {
          setState('error');
        }
      } catch (error) {
        console.error('Error polling payment status:', error);
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 2000);
        } else {
          setState('error');
        }
      }
    };

    poll();
  };

  const handleRetry = () => {
    setState('form');
    setPayment(null);
    setSelectedMethod(null);
    setFormData({
      vpa: '',
      cardNumber: '',
      expiryMonth: '',
      expiryYear: '',
      cvv: '',
      cardholderName: ''
    });
  };

  if (loading) {
    return <div className="checkout-loading">Loading...</div>;
  }

  return (
    <div data-testid="checkout-container" className="checkout-container">
      {order && (
        <div data-testid="order-summary" className="order-summary">
          <h2>Complete Payment</h2>
          <div className="order-info">
            <span>Amount: </span>
            <span data-testid="order-amount">{formatAmount(order.amount)}</span>
          </div>
          <div className="order-info">
            <span>Order ID: </span>
            <span data-testid="order-id">{order.id}</span>
          </div>
        </div>
      )}

      {state === 'form' && (
        <>
          <div data-testid="payment-methods" className="payment-methods">
            <button
              data-testid="method-upi"
              data-method="upi"
              className={`method-btn ${selectedMethod === 'upi' ? 'active' : ''}`}
              onClick={() => setSelectedMethod('upi')}
            >
              UPI
            </button>
            <button
              data-testid="method-card"
              data-method="card"
              className={`method-btn ${selectedMethod === 'card' ? 'active' : ''}`}
              onClick={() => setSelectedMethod('card')}
            >
              Card
            </button>
          </div>

          {selectedMethod === 'upi' && (
            <form data-testid="upi-form" className="payment-form" onSubmit={handlePayment}>
              <input
                data-testid="vpa-input"
                name="vpa"
                placeholder="username@bank"
                type="text"
                value={formData.vpa}
                onChange={handleInputChange}
                required
              />
              <button data-testid="pay-button" type="submit" className="pay-btn">
                Pay {order && formatAmount(order.amount)}
              </button>
            </form>
          )}

          {selectedMethod === 'card' && (
            <form data-testid="card-form" className="payment-form" onSubmit={handlePayment}>
              <input
                data-testid="card-number-input"
                name="cardNumber"
                placeholder="Card Number"
                type="text"
                value={formData.cardNumber}
                onChange={handleInputChange}
                required
              />
              <div className="form-row">
                <input
                  data-testid="expiry-input"
                  name="expiryMonth"
                  placeholder="MM"
                  type="text"
                  maxLength="2"
                  value={formData.expiryMonth}
                  onChange={handleInputChange}
                  required
                />
                <span className="separator">/</span>
                <input
                  name="expiryYear"
                  placeholder="YY"
                  type="text"
                  maxLength="2"
                  value={formData.expiryYear}
                  onChange={handleInputChange}
                  required
                />
                <input
                  data-testid="cvv-input"
                  name="cvv"
                  placeholder="CVV"
                  type="text"
                  maxLength="3"
                  value={formData.cvv}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <input
                data-testid="cardholder-name-input"
                name="cardholderName"
                placeholder="Name on Card"
                type="text"
                value={formData.cardholderName}
                onChange={handleInputChange}
                required
              />
              <button data-testid="pay-button" type="submit" className="pay-btn">
                Pay {order && formatAmount(order.amount)}
              </button>
            </form>
          )}
        </>
      )}

      {state === 'processing' && (
        <div data-testid="processing-state" className="processing-state">
          <div className="spinner"></div>
          <span data-testid="processing-message" className="processing-message">
            Processing payment...
          </span>
        </div>
      )}

      {state === 'success' && payment && (
        <div data-testid="success-state" className="success-state">
          <h2>Payment Successful!</h2>
          <div className="success-info">
            <span>Payment ID: </span>
            <span data-testid="payment-id">{payment.id}</span>
          </div>
          <span data-testid="success-message" className="success-message">
            Your payment has been processed successfully
          </span>
        </div>
      )}

      {state === 'error' && (
        <div data-testid="error-state" className="error-state">
          <h2>Payment Failed</h2>
          <span data-testid="error-message" className="error-message">
            {payment?.error_description || 'Payment could not be processed. Please try again.'}
          </span>
          <button data-testid="retry-button" onClick={handleRetry} className="retry-btn">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export default Checkout;