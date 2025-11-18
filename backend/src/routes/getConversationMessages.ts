/**
 * GET /conversations/:sessionId/messages
 * Retrieve conversation history for a specific session
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb.js';
import type { ConversationMessage, ConversationSession, ConversationHistoryResponse } from '../lib/conversationTypes.js';

export async function getConversationMessagesHandler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract sessionId from path
    const sessionId = event.pathParameters?.sessionId || event.pathParameters?.id;

    if (!sessionId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Session ID is required',
        }),
      };
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(sessionId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Invalid session ID format',
        }),
      };
    }

    // Extract userId from JWT claims
    const userId = (event.requestContext as any).authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          error: 'Unauthorized: missing user ID',
        }),
      };
    }

    // Get MongoDB connection
    const db = await getDatabase();
    const sessionsCollection = db.collection<ConversationSession>('conversation_sessions');
    const messagesCollection = db.collection<ConversationMessage>('conversation_messages');

    // Fetch session and verify ownership
    const session = await sessionsCollection.findOne({
      _id: new ObjectId(sessionId),
      userId,
    });

    if (!session) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: 'Session not found or access denied',
        }),
      };
    }

    // Fetch all messages for this session (sorted by timestamp)
    const messages = await messagesCollection
      .find({ sessionId: new ObjectId(sessionId) })
      .sort({ timestamp: 1 })
      .toArray();

    // Build response
    const response: ConversationHistoryResponse = {
      success: true,
      sessionId: sessionId,
      session: {
        userId: session.userId,
        vehicleId: session.vehicleId?.toString() || null,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        messageCount: session.messageCount,
        title: session.title || null,
      },
      messages: messages.map((msg) => ({
        id: msg._id?.toString() || '',
        role: msg.role,
        content: msg.content,
        toolsUsed: msg.toolsUsed || undefined,
        timestamp: msg.timestamp.toISOString(),
      })),
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[getConversationMessages] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
      }),
    };
  }
}
