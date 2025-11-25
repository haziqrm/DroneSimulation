import React, { useState } from 'react';
import './DeliveryForm.css';
import { submitDelivery } from '../utils/api';
import { toast } from 'react-toastify';

const DeliveryForm = ({ availableDrones = 0, onDeliverySubmitted }) => {
  const [latitude, setLatitude] = useState(55.9445);
  const [longitude, setLongitude] = useState(-3.1892);
  const [capacity, setCapacity] = useState(2.0);
  const [cooling, setCooling] = useState(false);
  const [heating, setHeating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const presetLocations = [
    { name: '🏥 Royal Infirmary', lat: 55.9213, lng: -3.1363 },
    { name: '🏛️ University', lat: 55.9445, lng: -3.1892 },
    { name: '🏰 Castle', lat: 55.9486, lng: -3.1999 },
    { name: '🌳 Princes St', lat: 55.9507, lng: -3.2055 }
  ];

  const handlePresetClick = (preset) => {
    setLatitude(preset.lat);
    setLongitude(preset.lng);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (availableDrones === 0) {
      toast.error('❌ No drones available!');
      return;
    }

    setSubmitting(true);

    try {
      const deliveryData = {
        latitude,
        longitude,
        capacity,
        cooling,
        heating
      };

      console.log('📦 Submitting delivery:', deliveryData);
      const result = await submitDelivery(deliveryData);
      
      console.log('✅ Delivery result:', result);

      if (result.success) {
        toast.success(`✅ Drone ${result.droneId} dispatched!`);
        if (onDeliverySubmitted) {
          onDeliverySubmitted(result);
        }
      } else {
        toast.error(`❌ ${result.message}`);
      }
    } catch (error) {
      console.error('❌ Error submitting delivery:', error);
      toast.error(`❌ Failed: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="delivery-form">
      <h2>📦 New Delivery</h2>
      
      <div 
        className="available-badge" 
        style={{
          backgroundColor: availableDrones > 0 ? '#10b981' : '#ef4444',
          color: 'white'
        }}
      >
        Available: {availableDrones}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h4>Quick Locations</h4>
          <div className="preset-grid">
            {presetLocations.map((preset, index) => (
              <button
                key={index}
                type="button"
                className="preset-button"
                onClick={() => handlePresetClick(preset)}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h4>Coordinates</h4>
          <div className="coordinate-inputs">
            <div className="input-group">
              <label htmlFor="latitude">Latitude</label>
              <input
                id="latitude"
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(parseFloat(e.target.value))}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="longitude">Longitude</label>
              <input
                id="longitude"
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(parseFloat(e.target.value))}
                required
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Package Details</h4>
          <div className="input-group">
            <label htmlFor="capacity">
              Capacity: <strong>{capacity} kg</strong>
            </label>
            <input
              id="capacity"
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={capacity}
              onChange={(e) => setCapacity(parseFloat(e.target.value))}
            />
            <div className="capacity-display">
              {capacity} kg
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Special Requirements</h4>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={cooling}
                onChange={(e) => setCooling(e.target.checked)}
              />
              <span>❄️ Cooling Required</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={heating}
                onChange={(e) => setHeating(e.target.checked)}
              />
              <span>🔥 Heating Required</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={submitting || availableDrones === 0}
        >
          {submitting ? '⏳ Dispatching...' : '🚁 Dispatch Drone'}
        </button>

        {availableDrones === 0 && (
          <div className="warning-message">
            ⚠️ All drones are currently busy. Please wait...
          </div>
        )}
      </form>
    </div>
  );
};

export default DeliveryForm;