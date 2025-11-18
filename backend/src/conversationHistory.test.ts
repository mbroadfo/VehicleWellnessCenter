/**
 * Integration tests for conversation history persistence
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { getSecretsFromParameterStore } from '../src/lib/parameterStore';
import type { ConversationSession, ConversationMessage } from '../src/lib/conversationTypes';

describe('Conversation History Integration Tests', () => {
  let client: MongoClient;
  let sessionId: ObjectId;
  const testUserId = 'test-user-123';
  const testVehicleId = new ObjectId();

  beforeAll(async () => {
    // Connect to MongoDB
    const secrets = await getSecretsFromParameterStore();
    const username = secrets.MONGODB_ATLAS_USERNAME;
    const password = secrets.MONGODB_ATLAS_PASSWORD;
    const host = secrets.MONGODB_ATLAS_HOST;
    const uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/?appName=vehicalwellnesscenter-cluster`;

    client = new MongoClient(uri);
    await client.connect();

    // Clean up any existing test data
    const db = client.db('vehicle_wellness_center');
    await db.collection('conversation_messages').deleteMany({ userId: testUserId });
    await db.collection('conversation_sessions').deleteMany({ userId: testUserId });
  });

  afterAll(async () => {
    // Clean up test data
    if (client) {
      const db = client.db('vehicle_wellness_center');
      await db.collection('conversation_messages').deleteMany({ userId: testUserId });
      await db.collection('conversation_sessions').deleteMany({ userId: testUserId });
      await client.close();
    }
  });

  it('should create a conversation session with TTL index', async () => {
    const db = client.db('vehicle_wellness_center');
    const sessionsCollection = db.collection<ConversationSession>('conversation_sessions');

    // Create session
    sessionId = new ObjectId();
    const newSession: ConversationSession = {
      _id: sessionId,
      userId: testUserId,
      vehicleId: testVehicleId,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      messageCount: 0,
      title: 'Test Conversation'
    };

    await sessionsCollection.insertOne(newSession);

    // Verify session exists
    const savedSession = await sessionsCollection.findOne({ _id: sessionId });
    expect(savedSession).toBeTruthy();
    expect(savedSession?.userId).toBe(testUserId);
    expect(savedSession?.title).toBe('Test Conversation');
  });

  it('should persist conversation messages with timestamps', async () => {
    const db = client.db('vehicle_wellness_center');
    const messagesCollection = db.collection<ConversationMessage>('conversation_messages');

    // Create user message
    const userMessage: ConversationMessage = {
      sessionId,
      userId: testUserId,
      vehicleId: testVehicleId,
      role: 'user',
      content: 'What oil change records do I have?',
      timestamp: new Date()
    };

    await messagesCollection.insertOne(userMessage);

    // Create assistant message
    const assistantMessage: ConversationMessage = {
      sessionId,
      userId: testUserId,
      vehicleId: testVehicleId,
      role: 'assistant',
      content: 'You have 3 oil change records.',
      toolsUsed: ['listVehicleEvents'],
      timestamp: new Date()
    };

    await messagesCollection.insertOne(assistantMessage);

    // Verify messages
    const messages = await messagesCollection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray();

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('What oil change records do I have?');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].toolsUsed).toContain('listVehicleEvents');
  });

  it('should retrieve conversation history in chronological order', async () => {
    const db = client.db('vehicle_wellness_center');
    const messagesCollection = db.collection<ConversationMessage>('conversation_messages');

    // Add more messages
    const messages: ConversationMessage[] = [
      {
        sessionId,
        userId: testUserId,
        vehicleId: testVehicleId,
        role: 'user',
        content: 'When was the last one?',
        timestamp: new Date(Date.now() + 1000)
      },
      {
        sessionId,
        userId: testUserId,
        vehicleId: testVehicleId,
        role: 'assistant',
        content: 'Your last oil change was 2 months ago.',
        timestamp: new Date(Date.now() + 2000)
      }
    ];

    await messagesCollection.insertMany(messages);

    // Retrieve all messages
    const allMessages = await messagesCollection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray();

    expect(allMessages).toHaveLength(4);
    expect(allMessages[0].content).toBe('What oil change records do I have?');
    expect(allMessages[3].content).toBe('Your last oil change was 2 months ago.');
  });

  it('should limit conversation history to last N messages', async () => {
    const db = client.db('vehicle_wellness_center');
    const messagesCollection = db.collection<ConversationMessage>('conversation_messages');

    // Retrieve last 2 messages only
    const recentMessages = await messagesCollection
      .find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(2)
      .toArray();

    expect(recentMessages).toHaveLength(2);
    // Should be most recent first (reverse chronological)
    expect(recentMessages[0].content).toBe('Your last oil change was 2 months ago.');
    expect(recentMessages[1].content).toBe('When was the last one?');
  });

  it('should update session metadata on new messages', async () => {
    const db = client.db('vehicle_wellness_center');
    const sessionsCollection = db.collection<ConversationSession>('conversation_sessions');

    const now = new Date();
    await sessionsCollection.updateOne(
      { _id: sessionId },
      {
        $set: { lastActiveAt: now },
        $inc: { messageCount: 2 }
      }
    );

    const updatedSession = await sessionsCollection.findOne({ _id: sessionId });
    expect(updatedSession?.messageCount).toBe(2);
    expect(updatedSession?.lastActiveAt.getTime()).toBeCloseTo(now.getTime(), -2);
  });

  it('should verify TTL indexes exist', async () => {
    const db = client.db('vehicle_wellness_center');

    // Check conversation_sessions TTL index
    const sessionIndexes = await db.collection('conversation_sessions').indexes();
    const sessionTTL = sessionIndexes.find(idx => idx.name === 'ttl_inactive_sessions');
    expect(sessionTTL).toBeTruthy();
    expect(sessionTTL?.expireAfterSeconds).toBe(7776000); // 90 days

    // Check conversation_messages TTL index
    const messageIndexes = await db.collection('conversation_messages').indexes();
    const messageTTL = messageIndexes.find(idx => idx.name === 'ttl_message_expiry');
    expect(messageTTL).toBeTruthy();
    expect(messageTTL?.expireAfterSeconds).toBe(2592000); // 30 days
  });
}, 15000); // 15 second timeout for external API calls
