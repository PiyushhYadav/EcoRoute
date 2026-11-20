const API_BASE = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    let errorDetail = 'API Request failed';
    try {
      const err = await res.json();
      errorDetail = err.detail || JSON.stringify(err);
    } catch {
      errorDetail = `${res.status} ${res.statusText}`;
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse(res);
  },

  async getGraph() {
    const res = await fetch(`${API_BASE}/graph`);
    return handleResponse(res);
  },

  async createPickup(pickupData) {
    const res = await fetch(`${API_BASE}/pickups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pickupData),
    });
    return handleResponse(res);
  },

  async updatePickup(id, updates) {
    const res = await fetch(`${API_BASE}/pickups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  async deletePickup(id) {
    const res = await fetch(`${API_BASE}/pickups/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async createCentre(centreData) {
    const res = await fetch(`${API_BASE}/centres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(centreData),
    });
    return handleResponse(res);
  },

  async updateCentre(id, updates) {
    const res = await fetch(`${API_BASE}/centres/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  async deleteCentre(id) {
    const res = await fetch(`${API_BASE}/centres/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async updateNode(nodeId, payload) {
    const res = await fetch(`${API_BASE}/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async deleteNode(nodeId) {
    const res = await fetch(`${API_BASE}/nodes/${nodeId}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async createEdge(edgeData) {
    const res = await fetch(`${API_BASE}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edgeData),
    });
    return handleResponse(res);
  },

  async updateEdge(id, updates) {
    const res = await fetch(`${API_BASE}/edges/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  async deleteEdge(id) {
    const res = await fetch(`${API_BASE}/edges/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async getOptimization(order = 'default', metric = 'time') {
    const res = await fetch(`${API_BASE}/optimize?order=${encodeURIComponent(order)}&metric=${encodeURIComponent(metric)}`);
    return handleResponse(res);
  },

  async resetDemo() {
    const res = await fetch(`${API_BASE}/reset-demo`, {
      method: 'POST',
    });
    return handleResponse(res);
  },
};

export const updateNode = (nodeId, payload) => api.updateNode(nodeId, payload);
export const deleteNode = (nodeId) => api.deleteNode(nodeId);
export default api;
