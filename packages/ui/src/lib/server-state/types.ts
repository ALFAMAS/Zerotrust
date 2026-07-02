export interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    total?: number;
    totalPages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface Wallet {
  balance: number;
  lifetimeBalance: number;
  currency: string;
  autoTopUp: boolean;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description?: string | null;
  createdAt?: string;
  optimistic?: boolean;
}

export interface WalletTransactionsParams {
  limit?: number;
  page?: number;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt?: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: "pending" | "delivered" | "failed" | "retrying";
  attempt: number;
  responseStatus: number | null;
  error: string | null;
  recordedAt: string;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[];
}

export interface WebhookDeliveriesParams {
  limit?: number;
}

export interface CreateWebhookEndpointInput {
  url: string;
  secret: string;
  events: string[];
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  authorRole: "user" | "agent";
  body: string;
  createdAt: string;
}

export interface SupportTicketsResponse {
  tickets: SupportTicket[];
  scope?: "mine" | "all";
}

export interface SupportThreadResponse {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

export interface CreateSupportTicketInput {
  subject: string;
  message: string;
  priority?: "low" | "normal" | "high";
}
