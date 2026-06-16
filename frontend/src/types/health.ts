export interface ApiHealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface DatabaseHealthResponse {
  status: string;
  database: string;
  message?: string;
}
