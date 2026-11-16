export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface StandardApiResponse<T = unknown> {
  responseCode: string;
  responseMessage: string;
  response: T;
  meta?: PaginationMeta;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface StandardApiErrorResponse {
  responseCode: string;
  responseMessage: string;
  errors?: ApiFieldError[];
  timestamp: string;
  path: string;
}
