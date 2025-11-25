const API_BASE = 'http://localhost:8080/api/v1';
const ILP_BASE = 'https://ilp-rest-2025-bvh6e9hschfagrgy.ukwest-01.azurewebsites.net';

export const submitDelivery = async (deliveryData) => {
  const response = await fetch(`${API_BASE}/submitDelivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deliveryData),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

export const getSystemStatus = async () => {
  const response = await fetch(`${API_BASE}/systemStatus`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

export const getAvailableDrones = async () => {
  const response = await fetch(`${API_BASE}/availableDrones`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

export const getRestrictedAreas = async () => {
  console.log('📡 Fetching restricted areas from:', `${ILP_BASE}/restricted-areas`);
  
  try {
    const response = await fetch(`${ILP_BASE}/restricted-areas`);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch restricted areas:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Restricted areas response:', data);
    return data;
  } catch (error) {
    console.error('❌ Error in getRestrictedAreas:', error);
    throw error;
  }
};

export const getServicePoints = async () => {
  console.log('📡 Fetching service points from:', `${ILP_BASE}/service-points`);
  
  try {
    const response = await fetch(`${ILP_BASE}/service-points`);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch service points:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Service points response:', data);
    return data;
  } catch (error) {
    console.error('❌ Error in getServicePoints:', error);
    throw error;
  }
};

// Legacy endpoint - kept for backwards compatibility
export const calcDeliveryPath = async (dispatches) => {
  const response = await fetch(`${API_BASE}/calcDeliveryPath`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dispatches),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

export const getDronesWithCooling = async (hasCooling) => {
  const response = await fetch(`${API_BASE}/dronesWithCooling/${hasCooling}`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};