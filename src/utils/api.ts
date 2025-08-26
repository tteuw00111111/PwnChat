const BASE_URL = "http://localhost:3001/api";

const request = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("jwt_token");
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "An API error occurred");
  }
  return response.json();
};

export const authAPI = {
  login: (username: string, password: string) => {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  // FIX: Update register to accept the public key bundle
  register: (username: string, password: string, publicKeyBundle: object) => {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, publicKeyBundle }),
    });
  },

  // FIX: Add the new getUsers function
  getUsers: () => {
    return request("/users");
  },
};
