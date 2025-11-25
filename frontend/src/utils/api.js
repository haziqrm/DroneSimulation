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
  // Fetch directly from ILP service
  const response = await fetch(`${ILP_BASE}/restricted-areas`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
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