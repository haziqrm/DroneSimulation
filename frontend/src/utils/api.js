const API_BASE = 'http://localhost:8080/api';
const ILP_BASE = 'https://ilp-rest-2025-bvh6e9hschfagrgy.ukwest-01.azurewebsites.net';

export const dispatchDrone = async (
  customerName, 
  fromLongitude, 
  fromLatitude, 
  toLongitude, 
  toLatitude,
  requiresCooling = false,
  requiresHeating = false,
  capacity = 0
) => {
  console.log('🚁 Dispatching drone for:', customerName);
  
  const requestBody = {
    customerName,
    fromLongitude,
    fromLatitude,
    toLongitude,
    toLatitude
  };

  // Add capabilities if provided
  if (requiresCooling !== undefined) {
    requestBody.requiresCooling = requiresCooling;
  }
  if (requiresHeating !== undefined) {
    requestBody.requiresHeating = requiresHeating;
  }
  if (capacity > 0) {
    requestBody.capacity = capacity;
  }

  console.log('📦 Request payload:', requestBody);
  
  const response = await fetch(`${API_BASE}/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to dispatch drone');
  }

  return response.json();
};

export const getRestrictedAreas = async () => {
  console.log('📡 Fetching restricted areas from:', `${ILP_BASE}/restricted-areas`);
  
  try {
    const response = await fetch(`${ILP_BASE}/restricted-areas`);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch restricted areas:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Restricted areas response:', data);
    return data;
  } catch (error) {
    console.error('❌ Error fetching restricted areas:', error);
    throw error;
  }
};

export const getServicePoints = async () => {
  console.log('📡 Fetching service points from:', `${ILP_BASE}/service-points`);
  
  try {
    const response = await fetch(`${ILP_BASE}/service-points`);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch service points:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Service points response:', data);
    return data;
  } catch (error) {
    console.error('❌ Error fetching service points:', error);
    throw error;
  }
};