import React, { useState } from 'react';
import { dispatchDrone } from '../utils/api';

const DELIVERY_LOCATIONS = [
  { name: "Princes Street", lat: 55.9520, lng: -3.1960 },
  { name: "Royal Infirmary", lat: 55.9213, lng: -3.1359 },
  { name: "Edinburgh Castle", lat: 55.9486, lng: -3.1999 },
  { name: "Holyrood Palace", lat: 55.9527, lng: -3.1720 },
  { name: "Arthur's Seat", lat: 55.9444, lng: -3.1618 },
  { name: "Leith Walk", lat: 55.9697, lng: -3.1735 },
  { name: "Ocean Terminal", lat: 55.9808, lng: -3.1730 },
  { name: "Portobello Beach", lat: 55.9544, lng: -3.1140 },
  { name: "Haymarket Station", lat: 55.9465, lng: -3.2185 },
  { name: "Murrayfield Stadium", lat: 55.9428, lng: -3.2410 },
  { name: "Royal Botanic Garden", lat: 55.9657, lng: -3.2091 },
  { name: "Cameron Toll", lat: 55.9283, lng: -3.1582 },
  { name: "Craigmillar Castle", lat: 55.9247, lng: -3.1401 },
  { name: "Edinburgh Zoo", lat: 55.9424, lng: -3.2684 },
  { name: "Queensferry Crossing", lat: 55.9891, lng: -3.3984 }
];

const DeliveryForm = () => {
  const [orderItems, setOrderItems] = useState([]);
  const [currentDelivery, setCurrentDelivery] = useState({
    customerName: '',
    toLocation: '',
    requiresCooling: false,
    requiresHeating: false,
    capacity: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentDelivery(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const addToOrder = () => {
    if (!currentDelivery.customerName || !currentDelivery.toLocation || !currentDelivery.capacity) {
      alert('Please fill in all required fields (customer name, delivery location, and capacity)');
      return;
    }

    const toPoint = DELIVERY_LOCATIONS.find(loc => loc.name === currentDelivery.toLocation);
    if (!toPoint) {
      alert('Invalid delivery location');
      return;
    }

    setOrderItems([...orderItems, {
      ...currentDelivery,
      toLat: toPoint.lat,
      toLng: toPoint.lng,
      capacity: parseInt(currentDelivery.capacity),
      id: Date.now()
    }]);

    setCurrentDelivery({
      customerName: '',
      toLocation: '',
      requiresCooling: false,
      requiresHeating: false,
      capacity: ''
    });
  };

  const removeFromOrder = (id) => {
    setOrderItems(orderItems.filter(item => item.id !== id));
  };

  const dispatchOrder = async () => {
    if (orderItems.length === 0) {
      alert('Please add at least one delivery to the order');
      return;
    }

    setSubmitting(true);

    try {
      let successCount = 0;
      let failedDeliveries = [];

      for (const item of orderItems) {
        try {
          // Backend will determine which service point to use
          // We just send destination coordinates and capabilities
          await dispatchDrone(
            item.customerName,
            item.toLng,  // Backend expects these parameters
            item.toLat,
            item.toLng,
            item.toLat,
            item.requiresCooling,
            item.requiresHeating,
            item.capacity
          );
          successCount++;
        } catch (error) {
          console.error('Failed to dispatch:', error);
          failedDeliveries.push(item.customerName);
        }
      }

      if (failedDeliveries.length > 0) {
        alert(`⚠️ ${failedDeliveries.length} delivery(s) could not be dispatched:\n${failedDeliveries.join(', ')}\n\nNo available drones with required capabilities.`);
      }

      if (successCount > 0) {
        setOrderItems([]);
      }
    } catch (error) {
      console.error('Error dispatching order:', error);
      alert('Failed to dispatch order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="delivery-form">
      <h2>Create Delivery Order</h2>

      <div className="form-group">
        <label>Customer Name *</label>
        <input
          type="text"
          name="customerName"
          value={currentDelivery.customerName}
          onChange={handleInputChange}
          placeholder="Enter customer name"
        />
      </div>

      <div className="form-group">
        <label>Deliver To *</label>
        <select
          name="toLocation"
          value={currentDelivery.toLocation}
          onChange={handleInputChange}
        >
          <option value="">Select delivery location...</option>
          {DELIVERY_LOCATIONS.map((loc, idx) => (
            <option key={idx} value={loc.name}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Capacity (grams) *</label>
        <input
          type="number"
          name="capacity"
          value={currentDelivery.capacity}
          onChange={handleInputChange}
          placeholder="e.g., 500"
          min="1"
        />
      </div>

      <div className="form-group-inline">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="requiresCooling"
            checked={currentDelivery.requiresCooling}
            onChange={handleInputChange}
          />
          <span>Requires Cooling</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            name="requiresHeating"
            checked={currentDelivery.requiresHeating}
            onChange={handleInputChange}
          />
          <span>Requires Heating</span>
        </label>
      </div>

      <button className="btn btn-add" onClick={addToOrder}>
        Add to Order
      </button>

      {orderItems.length > 0 && (
        <div className="order-items">
          <h3>Order Items ({orderItems.length})</h3>
          <div className="order-list">
            {orderItems.map((item) => (
              <div key={item.id} className="order-item">
                <div className="order-item-info">
                  <strong>{item.customerName}</strong>
                  <div className="order-item-details">
                    📍 {item.toLocation}
                  </div>
                  <div className="order-item-meta">
                    {item.capacity}g
                    {item.requiresCooling && ' • ❄️ Cooling'}
                    {item.requiresHeating && ' • 🔥 Heating'}
                  </div>
                </div>
                <button className="btn-remove" onClick={() => removeFromOrder(item.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className="btn btn-dispatch"
        onClick={dispatchOrder}
        disabled={orderItems.length === 0 || submitting}
      >
        {submitting ? 'Dispatching...' : `Dispatch Order (${orderItems.length})`}
      </button>
    </div>
  );
};

export default DeliveryForm;