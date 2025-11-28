const API_BASE = 'http://localhost:8080/api';
const ILP_BASE = 'https://ilp-rest-2025-bvh6e9hschfagrgy.ukwest-01.azurewebsites.net';

export const dispatchBatch = async (deliveries, batchId) => {
  console.log('Dispatching batch:', batchId);
  console.log('Deliveries:', deliveries.length);
  
  try {
    const response = await fetch(`${API_BASE}/v1/submitBatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        batchId: batchId,
        deliveries: deliveries.map(d => ({
          customerName: d.customerName,
          latitude: d.toLat,
          longitude: d.toLng,
          capacity: d.capacity,
          cooling: d.requiresCooling,
          heating: d.requiresHeating
        }))
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Batch dispatch failed:', errorText);
      throw new Error(`Failed to dispatch batch: ${errorText}`);
    }

    const result = await response.json();
    console.log('Batch dispatch result:', result);
    
    if (!result.success) {
      throw new Error(result.message || 'Batch dispatch failed');
    }

    return result;
  } catch (error) {
    console.error('Error in batch dispatch:', error);
    throw error;
  }
};

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
  console.log('Dispatching drone for:', customerName);
  console.log('Capacity:', capacity, 'kg');
  console.log('Cooling:', requiresCooling);
  console.log('Heating:', requiresHeating);
  
  const requestBody = {
    customerName,
    fromLongitude,
    fromLatitude,
    toLongitude,
    toLatitude
  };

  if (requiresCooling !== undefined) {
    requestBody.requiresCooling = requiresCooling;
  }
  if (requiresHeating !== undefined) {
    requestBody.requiresHeating = requiresHeating;
  }
  if (capacity > 0) {
    requestBody.capacity = capacity;
  }

  console.log('Request payload:', requestBody);
  
  const response = await fetch(`${API_BASE}/v1/submitDelivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude: toLatitude,
      longitude: toLongitude,
      capacity: capacity,
      cooling: requiresCooling,
      heating: requiresHeating
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Server response:', errorText);
    throw new Error(`Failed to dispatch drone: ${errorText}`);
  }

  const result = await response.json();
  console.log('Dispatch result:', result);
  
  if (!result.success) {
    throw new Error(result.message || 'Dispatch failed');
  }

  return result;
};

export const getRestrictedAreas = async () => {
  console.log('Fetching restricted areas from:', `${ILP_BASE}/restricted-areas`);
  
  try {
    const response = await fetch(`${ILP_BASE}/restricted-areas`);
    
    if (!response.ok) {
      console.error('Failed to fetch restricted areas:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Restricted areas response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching restricted areas:', error);
    throw error;
  }
};

export const getServicePoints = async () => {
  console.log('Fetching service points from:', `${ILP_BASE}/service-points`);
  
  try {
    const response = await fetch(`${ILP_BASE}/service-points`);
    
    if (!response.ok) {
      console.error('Failed to fetch service points:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Service points response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching service points:', error);
    throw error;
  }
};