import React, { useState } from 'react';
import { dispatchDrone, dispatchBatch } from '../utils/api';

const DELIVERY_PRESETS = [
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
    locationName: '',
    toLat: '',
    toLng: '',
    requiresCooling: false,
    requiresHeating: false,
    capacity: 2.0 // Default 2kg
  });
  const [orderCounter, setOrderCounter] = useState(1);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentDelivery(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCapacityChange = (e) => {
    setCurrentDelivery(prev => ({
      ...prev,
      capacity: parseFloat(e.target.value)
    }));
  };

  const handlePresetSelect = (e) => {
    const presetName = e.target.value;
    if (!presetName) {
      setCurrentDelivery(prev => ({
        ...prev,
        locationName: '',
        toLat: '',
        toLng: ''
      }));
      return;
    }

    const preset = DELIVERY_PRESETS.find(p => p.name === presetName);
    if (preset) {
      setCurrentDelivery(prev => ({
        ...prev,
        locationName: preset.name,
        toLat: preset.lat.toString(),
        toLng: preset.lng.toString()
      }));
    }
  };

  const addToOrder = () => {
    if (!currentDelivery.customerName || !currentDelivery.toLat || !currentDelivery.toLng) {
      alert('Please fill in customer name and delivery coordinates');
      return;
    }

    const lat = parseFloat(currentDelivery.toLat);
    const lng = parseFloat(currentDelivery.toLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert('Invalid coordinates. Please enter valid numbers.');
      return;
    }

    if (lat < 55.9 || lat > 56.0 || lng < -3.4 || lng > -3.0) {
      alert('Coordinates seem outside Edinburgh area. Please check.');
      return;
    }

    setOrderItems([...orderItems, {
      ...currentDelivery,
      toLat: lat,
      toLng: lng,
      id: Date.now()
    }]);

    setCurrentDelivery({
      customerName: '',
      locationName: '',
      toLat: '',
      toLng: '',
      requiresCooling: false,
      requiresHeating: false,
      capacity: 2.0
    });
  };

  const removeFromOrder = (id) => {
    setOrderItems(orderItems.filter(item => item.id !== id));
  };

  const dispatchOrder = async () => {
    if (orderItems.length === 0) {
      return;
    }

    const itemsToDispatch = [...orderItems];
    const batchId = `ORDER-${orderCounter}`;
    setOrderCounter(prev => prev + 1);
    setOrderItems([]); // Clear immediately so user can add more

    console.log(`📦 Dispatching batch ${batchId} with ${itemsToDispatch.length} deliveries`);

    try {
      // Try to dispatch as a batch first
      const result = await dispatchBatch(itemsToDispatch, batchId);
      
      if (!result.success) {
        console.error('❌ Batch dispatch failed:', result.message);
        alert(`❌ Batch dispatch failed: ${result.message}\n\nTry again in a few seconds when drones are available.`);
        
        // Put items back in the queue
        setOrderItems(itemsToDispatch);
        setOrderCounter(prev => prev - 1); // Revert counter
        return;
      }
      
      console.log(`✅ Batch ${batchId} dispatched successfully:`, result);
      
      // Show notification if some drones were skipped
      if (result.skippedDrones && result.skippedDrones.length > 0) {
        console.warn(`⚠️ Some drones were skipped:`, result.skippedDrones);
        alert(`⚠️ Batch dispatched, but ${result.skippedDrones.length} drone(s) were unavailable.\nDispatched: ${result.dispatchedDrones} drone(s)`);
      }
      
    } catch (error) {
      console.error('❌ Batch dispatch failed with exception:', error);
      alert(`❌ Failed to dispatch batch: ${error.message}\n\nAll drones may be busy. Try again in a few seconds.`);
      
      // Put items back in the queue
      setOrderItems(itemsToDispatch);
      setOrderCounter(prev => prev - 1); // Revert counter
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
        <label>Location Preset (Optional)</label>
        <select
          value={currentDelivery.locationName}
          onChange={handlePresetSelect}
        >
          <option value="">-- Select preset or enter coordinates below --</option>
          {DELIVERY_PRESETS.map((preset, idx) => (
            <option key={idx} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <div className="coordinate-grid">
        <div className="form-group">
          <label>Latitude *</label>
          <input
            type="number"
            name="toLat"
            value={currentDelivery.toLat}
            onChange={handleInputChange}
            placeholder="55.9445"
            step="0.0001"
          />
        </div>
        <div className="form-group">
          <label>Longitude *</label>
          <input
            type="number"
            name="toLng"
            value={currentDelivery.toLng}
            onChange={handleInputChange}
            placeholder="-3.1892"
            step="0.0001"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Capacity: {currentDelivery.capacity.toFixed(1)} kg</label>
        <input
          type="range"
          name="capacity"
          min="0.5"
          max="20"
          step="0.5"
          value={currentDelivery.capacity}
          onChange={handleCapacityChange}
          className="capacity-slider"
        />
        <div className="capacity-helper">
          Available drone capacities: 4kg, 8kg, 12kg, 20kg
        </div>
      </div>

      <div className="form-group-inline">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="requiresCooling"
            checked={currentDelivery.requiresCooling}
            onChange={handleInputChange}
          />
          <span>❄️ Requires Cooling</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            name="requiresHeating"
            checked={currentDelivery.requiresHeating}
            onChange={handleInputChange}
          />
          <span>🔥 Requires Heating</span>
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
                    📍 {item.locationName || `${item.toLat.toFixed(4)}, ${item.toLng.toFixed(4)}`}
                  </div>
                  <div className="order-item-meta">
                    {item.capacity.toFixed(1)}kg
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
        disabled={orderItems.length === 0}
      >
        Dispatch Order ({orderItems.length})
      </button>
    </div>
  );
};

export default DeliveryForm;