import { useState, useCallback } from 'react';
import api from '../api/axios';
import { AxiosRequestConfig } from 'axios';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T = unknown>() {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const request = useCallback(async (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    payload?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      let res;
      if (method === 'get' || method === 'delete') {
        res = await api[method](url, config);
      } else {
        res = await api[method](url, payload, config);
      }
      const data = res.data?.data ?? res.data;
      setState({ data, loading: false, error: null });
      return data;
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        'Something went wrong';
      setState({ data: null, loading: false, error: message });
      throw new Error(message);
    }
  }, []);

  const get = useCallback((url: string, config?: AxiosRequestConfig) => request('get', url, undefined, config), [request]);
  const post = useCallback((url: string, data?: unknown, config?: AxiosRequestConfig) => request('post', url, data, config), [request]);
  const put = useCallback((url: string, data?: unknown, config?: AxiosRequestConfig) => request('put', url, data, config), [request]);
  const patch = useCallback((url: string, data?: unknown, config?: AxiosRequestConfig) => request('patch', url, data, config), [request]);
  const del = useCallback((url: string, config?: AxiosRequestConfig) => request('delete', url, undefined, config), [request]);

  return { ...state, get, post, put, patch, del, request };
}
