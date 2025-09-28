export interface ApiResponse<T = any> {
  data: T | null;
  meta: any;
  error:
    | {
        code: string;
        message: string;
        details?: any;
      }
    | null;
}

export const ok = <T>(data: T, meta: any = null): ApiResponse<T> => ({
  data,
  meta,
  error: null,
});

export const created = <T>(data: T): ApiResponse<T> => ({
  data,
  meta: null,
  error: null,
});

export const error = (
  code: string,
  message: string,
  details?: any
): ApiResponse<any> => ({
  data: null,
  meta: null,
  error: { code, message, details: details ?? null },
});
