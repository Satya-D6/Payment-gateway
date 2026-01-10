import React, { useState } from 'react';

const Checkout = () => {
  const [amount, setAmount] = useState(100);
  const [orderId, setOrderId] = useState('');

  const handlePayment = async () => {
    const apiKey = localStorage.getItem('api_key')
    const response = await fetch('http://localhost:8000/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ amount, currency: 'INR' })
    });
    const data = await response.json();
    setOrderId(data.id);
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h2>Checkout Simulation</h2>
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button onClick={handlePayment} style={{ marginLeft: '10px', padding: '10px' }}>Pay Now</button>
      {orderId && <p style={{ color: 'green' }}>Order Created: {orderId}</p>}
    </div>
  );
};

export default Checkout;