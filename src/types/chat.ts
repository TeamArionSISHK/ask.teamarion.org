export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatApiRequest {
  message: string;
  conversationId?: string;
  history?: ChatHistoryMessage[];
}

export interface ChatApiResponse {
  text: string;
  image_tags: string[];
  conversationId: string;
  conversationReset?: boolean;
}

export interface ChatImage {
  tag: string;
  src: string;
  alt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  images?: ChatImage[];
  status?: 'idle' | 'error' | 'streaming';
}

export interface RecentLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'error';
  scope: 'server' | 'chat' | 'stream';
  message: string;
  detail?: string;
}
