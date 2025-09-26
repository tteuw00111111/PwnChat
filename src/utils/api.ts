import axios from "axios";

export const ACCESS_TOKEN_KEY = "pwnchat_access_token";

const API_BASE_URL = "http://localhost:3001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


export const authAPI = {
  login: (credentials: { username?: string; password?: string }) =>
    api.post("/auth/login", credentials).then((res) => res.data),
  register: (userInfo: { username?: string; password?: string }) =>
    api.post("/auth/register", userInfo).then((res) => res.data),
};

export const userAPI = {
  list: () => api.get("/users").then((res) => res.data),
  search: (query: string) => api.get(`/users/search?username=${query}`).then((res) => res.data),
  getById: (id: string) => api.get(`/users/${id}`).then((res) => res.data),
  getProfile: () => api.get("/users/me").then((res) => res.data),
  updateProfile: (profile: { displayName?: string; profilePicture?: string }) =>
    api.put("/users/profile", profile).then((res) => res.data),
};

export const keyAPI = {
  getBundle: (username: string) =>
    api.get(`/keys/${username}`).then((res) => res.data),
  uploadBundle: (bundle: any) =>
    api.post("/keys/bundle", bundle).then((res) => res.data),
  topUpPrekeys: (prekeys: Array<string | { publicKeyB64: string }>) =>
    api.post("/keys/prekeys", { prekeys }).then((res) => res.data),
  getOneTimePrekey: (username: string) =>
    api.get(`/keys/${username}/prekey`).then((res) => res.data as { id: number; publicKeyB64: string }),
};

export const messageAPI = {
  getMessages: (peerId: string, limit?: number, offset?: number) =>
    api.get(`/messages/${peerId}`, { params: { limit, offset } }).then((res) => res.data),
  sendMessage: (message: { recipientId: string; ciphertext: string; header?: any; handshake?: any }) =>
    api.post("/messages", message).then((res) => res.data),
  getConversations: () =>
    api.get("/messages/conversations").then((res) => res.data),
};

export default api;
