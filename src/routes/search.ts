/**
 * AI Search Routes
 * Provides AI-powered search across messages and conversations
 */

import { Router, Request, Response } from 'express';
import { aiSearch, getConversationSummary, initSearchAI } from '../services/ai-search';
import { hybridMessageStore } from '../services/hybrid-message-store';
import log from '../services/activity-log';

const router = Router();

// Initialize AI search on module load
initSearchAI();

/**
 * POST /api/search
 * AI-powered search across all messages
 * Body: { query: string, userId?: string }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { query, userId } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    log.info('AI Search request', `Query: "${query.substring(0, 50)}..."`);

    // Get all messages from store
    const { data: messages } = await hybridMessageStore.getAll({
      userId,
      limit: 1000 // Get more messages for thorough search
    });

    if (messages.length === 0) {
      return res.json({
        success: true,
        data: {
          query,
          answer: 'No messages found. Start a WhatsApp connection to receive messages.',
          results: [],
          summary: 'No messages available to search.'
        }
      });
    }

    // Perform AI search
    const searchResults = await aiSearch(query, messages, userId);

    res.json({
      success: true,
      data: searchResults
    });

  } catch (error: any) {
    log.error('AI Search error', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/search/person/:name
 * Get AI summary of conversations with a specific person
 */
router.get('/person/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { userId } = req.query;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Person name is required'
      });
    }

    log.info('Person search request', `Looking for: "${name}"`);

    // Get all messages
    const { data: messages } = await hybridMessageStore.getAll({
      userId: userId as string,
      limit: 1000
    });

    // Get conversation summary
    const summary = await getConversationSummary(name, messages);

    // Also get matching messages
    const matchingMessages = messages.filter(m => 
      m.sender.toLowerCase().includes(name.toLowerCase()) ||
      m.content.toLowerCase().includes(name.toLowerCase()) ||
      (m.chat_name && m.chat_name.toLowerCase().includes(name.toLowerCase()))
    ).slice(0, 50);

    res.json({
      success: true,
      data: {
        person: name,
        summary,
        messageCount: matchingMessages.length,
        messages: matchingMessages.map(m => ({
          id: m.id,
          sender: m.sender,
          chatName: m.chat_name,
          content: m.content,
          timestamp: m.timestamp
        }))
      }
    });

  } catch (error: any) {
    log.error('Person search error', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/search/meetings
 * Find all meetings, calls, and appointments
 */
router.get('/meetings', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    log.info('Meetings search request', 'Finding all meetings and appointments');

    // Get all messages
    const { data: messages } = await hybridMessageStore.getAll({
      userId: userId as string,
      limit: 1000
    });

    // Search for meeting-related messages using AI
    const searchResults = await aiSearch(
      'Find all meetings, calls, appointments, video calls, and scheduled events. Include details about who, when, and what the meeting is about.',
      messages,
      userId as string
    );

    res.json({
      success: true,
      data: searchResults
    });

  } catch (error: any) {
    log.error('Meetings search error', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/search/tasks
 * Find all tasks and action items
 */
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    log.info('Tasks search request', 'Finding all tasks and action items');

    // Get all messages
    const { data: messages } = await hybridMessageStore.getAll({
      userId: userId as string,
      limit: 1000
    });

    // Search for task-related messages using AI
    const searchResults = await aiSearch(
      'Find all tasks, to-do items, action items, things to do, reminders, and deadlines. Include who assigned them and when they are due.',
      messages,
      userId as string
    );

    res.json({
      success: true,
      data: searchResults
    });

  } catch (error: any) {
    log.error('Tasks search error', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
