import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("codress.admin.token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error.response?.status === 401 && location.pathname !== "/login") {
      localStorage.removeItem("codress.admin.token");
      location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export function errorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e.response?.data?.error ?? e.message ?? "请求失败";
}
