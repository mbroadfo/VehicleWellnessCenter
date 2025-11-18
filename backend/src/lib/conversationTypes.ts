/**
 * Conversation Type Definitions
 * Types for chat history persistence
 */

import { ObjectId } from 'mongodb';

/**
 * Conversation session metadata
 * TTL: Auto-deleted after 90 days of inactivity
 */
export interface ConversationSession {
  _id?: ObjectId;
  userId: string; // Auth0 user ID
  vehicleId?: ObjectId | null; // Optional vehicle context
  createdAt: Date;
  lastActiveAt: Date; // Updated on each message (for TTL)
  messageCount: number;
  title?: string | null; // Generated from first user message
}

/**
 * Individual conversation message
 * TTL: Auto-deleted after 30 days
 */
export interface ConversationMessage {
  _id?: ObjectId;
  sessionId: ObjectId; // Reference to conversation_sessions._id
  userId: string; // Auth0 user ID
  vehicleId?: ObjectId | null; // Optional vehicle context
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[] | null; // Functions called (for assistant messages)
  timestamp: Date; // For TTL expiration
}

/**
 * Request body for POST /ai/chat
 */
export interface ChatRequest {
  message: string;
  sessionId?: string; // Optional - creates new session if omitted
  vehicleId?: string; // Optional vehicle context
}

/**
 * Response from POST /ai/chat
 */
export interface ChatResponse {
  success: boolean;
  sessionId: string;
  message: string; // AI response text
  toolsUsed?: string[]; // Functions the AI called
  conversationContext?: {
    messageCount: number;
    historyUsed: number; // How many previous messages were in context
  };
}

/**
 * Response from GET /conversations/:sessionId/messages
 */
export interface ConversationHistoryResponse {
  success: boolean;
  sessionId: string;
  session: {
    userId: string;
    vehicleId?: string | null;
    createdAt: string;
    lastActiveAt: string;
    messageCount: number;
    title?: string | null;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    toolsUsed?: string[];
    timestamp: string;
  }>;
}
