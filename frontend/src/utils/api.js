import axios from 'axios';

const API_BASE = 'http://localhost:8080/api/v1';

export async function startSimulation(dispatches) {
  const response = await axios.post(`${API_BASE}/startSimulation`, dispatches);
  return response.data;
}

export async function calcDeliveryPath(dispatches) {
  const response = await axios.post(`${API_BASE}/calcDeliveryPath`, dispatches);
  return response.data;
}

export async function getDronesWithCooling(hasCooling) {
  const response = await axios.get(`${API_BASE}/dronesWithCooling/${hasCooling}`);
  return response.data;
}