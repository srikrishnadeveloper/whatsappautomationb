/**
 * Daily Summary API Route
 * Generates comprehensive daily summaries with narrative text
 * All routes require auth (applied in index.ts). Uses req.userId for data isolation.
 */

import { Router } from 'express';
import { hybridMessageStore } from '../services/hybrid-message-store';
import { hybridActionItems } from '../services/hybrid-action-items';

const router = Router();

// Helper to generate narrative summary
function generateNarrativeSummary(data: {
  messageCount: number;
  senders: string[];
  categories: Record<string, number>;
  completedTasks: number;
  createdTasks: number;
  urgentMessages: number;
  date: string;
}): string {
  const { messageCount, senders, categories, completedTasks, createdTasks, urgentMessages, date } = data;
  
  if (messageCount === 0) {
    return "It was a quiet day with no messages received.";
  }
  
  let narrative = "";
  const dateObj = new Date(date);
  const isToday = dateObj.toDateString() === new Date().toDateString();
  const dayPrefix = isToday ? "Today" : `On ${dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
  
  // Opening sentence about message volume
  if (messageCount === 1) {
    narrative += `${dayPrefix}, you received 1 message from ${senders[0]}.`;
  } else if (messageCount < 5) {
    narrative += `${dayPrefix}, you received ${messageCount} messages from ${senders.length} ${senders.length === 1 ? 'person' : 'people'}.`;
  } else if (messageCount < 20) {
    narrative += `${dayPrefix}, you had a moderately active day with ${messageCount} messages across ${senders.length} conversations.`;
  } else {
    narrative += `${dayPrefix}, you had a busy day with ${messageCount} messages from ${senders.length} different contacts.`;
  }
  
  // Add category insights
  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  if (topCategory && categories[topCategory[0]] > messageCount * 0.3) {
    const percentage = Math.round((categories[topCategory[0]] / messageCount) * 100);
    narrative += ` Most of your communication (${percentage}%) was ${topCategory[0]}-related.`;
  } else if (Object.keys(categories).length > 2) {
    narrative += ` Your messages were well-balanced across ${Object.keys(categories).join(', ')} categories.`;
  }
  
  // Add urgency insights
  if (urgentMessages > 0) {
    if (urgentMessages === 1) {
      narrative += ` You had 1 high-priority message that needed attention.`;
    } else {
      narrative += ` You had ${urgentMessages} high-priority messages that needed attention.`;
    }
  }
  
  // Add task completion insights
  if (completedTasks > 0 && createdTasks > 0) {
    narrative += ` You completed ${completedTasks} ${completedTasks === 1 ? 'task' : 'tasks'} and created ${createdTasks} new ${createdTasks === 1 ? 'one' : 'ones'}.`;
  } else if (completedTasks > 0) {
    narrative += ` You completed ${completedTasks} ${completedTasks === 1 ? 'task' : 'tasks'}.`;
  } else if (createdTasks > 0) {
    narrative += ` You created ${createdTasks} new ${createdTasks === 1 ? 'task' : 'tasks'} from your messages.`;
  }
  
  // Closing motivational note
  if (completedTasks > 0 || urgentMessages === 0) {
    narrative += " Great work staying on top of things! 🎯";
  } else if (urgentMessages > 0) {
    narrative += " Stay focused on those priorities! 💪";
  }
  
  return narrative;
}

// GET /api/daily-summary?date=YYYY-MM-DD (optional, defaults to today)
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    
    // Parse date or use today
    const targetDate = date ? new Date(date as string) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const startISO = targetDate.toISOString();
    const endISO = nextDay.toISOString();
    
    // Fetch messages for the day
    const { data: allMessages } = await hybridMessageStore.getAll({ limit: 1000, userId: req.userId });
    const messages = allMessages.filter((m: any) => {
      const timestamp = m.created_at || m.timestamp;
      return timestamp >= startISO && timestamp < endISO;
    });
    
    // Fetch action items for the day
    const { data: allActions } = await hybridActionItems.getAll({ limit: 1000, userId: req.userId });
    const createdTasks = allActions.filter((a: any) => {
      const created = a.created_at || a.createdAt;
      return created >= startISO && created < endISO;
    });
    const completedTasks = allActions.filter((a: any) => {
      const completed = a.completed_at || a.completedAt;
      return completed && completed >= startISO && completed < endISO;
    });
    
    // Analyze messages
    const senders = [...new Set(messages.map((m: any) => m.sender || 'Unknown'))];
    const categories: Record<string, number> = {};
    let urgentCount = 0;
    
    messages.forEach((m: any) => {
      if (m.classification) {
        categories[m.classification] = (categories[m.classification] || 0) + 1;
      }
      if (m.priority === 'urgent' || m.priority === 'high') {
        urgentCount++;
      }
    });
    
    // Generate narrative
    const narrative = generateNarrativeSummary({
      messageCount: messages.length,
      senders,
      categories,
      completedTasks: completedTasks.length,
      createdTasks: createdTasks.length,
      urgentMessages: urgentCount,
      date: startISO
    });
    
    // Build highlights
    const highlights: string[] = [];
    
    if (messages.length > 0) {
      highlights.push(`📨 ${messages.length} messages from ${senders.length} ${senders.length === 1 ? 'contact' : 'contacts'}`);
    }
    
    if (urgentCount > 0) {
      highlights.push(`⚠️ ${urgentCount} high-priority ${urgentCount === 1 ? 'message' : 'messages'}`);
    }
    
    if (createdTasks.length > 0) {
      highlights.push(`✨ ${createdTasks.length} new ${createdTasks.length === 1 ? 'task created' : 'tasks created'}`);
    }
    
    if (completedTasks.length > 0) {
      highlights.push(`✅ ${completedTasks.length} ${completedTasks.length === 1 ? 'task completed' : 'tasks completed'}`);
    }
    
    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      highlights.push(`🏷️ Most messages were ${topCategory[0]}`);
    }
    
    // Top 3 senders
    const senderCounts: Record<string, number> = {};
    messages.forEach((m: any) => {
      const sender = m.sender || 'Unknown';
      senderCounts[sender] = (senderCounts[sender] || 0) + 1;
    });
    const topSenders = Object.entries(senderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sender, count]) => ({ sender, count }));
    
    res.json({
      success: true,
      data: {
        date: targetDate.toISOString(),
        narrative,
        highlights,
        stats: {
          totalMessages: messages.length,
          totalSenders: senders.length,
          urgentMessages: urgentCount,
          tasksCreated: createdTasks.length,
          tasksCompleted: completedTasks.length,
          categories,
          topSenders
        },
        tasks: {
          created: createdTasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status
          })),
          completed: completedTasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            completedAt: t.completed_at || t.completedAt
          }))
        },
        recentMessages: messages.slice(0, 5).map((m: any) => ({
          id: m.id,
          sender: m.sender,
          content: m.content,
          classification: m.classification,
          priority: m.priority,
          timestamp: m.created_at || m.timestamp
        }))
      },
      storage: hybridMessageStore.getStorageType()
    });
  } catch (error: any) {
    console.error('Error generating daily summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/daily-summary/week - Get summaries for the past week
router.get('/week', async (req, res) => {
  try {
    const summaries = [];
    
    // Generate summaries for the past 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const startISO = date.toISOString();
      const endISO = nextDay.toISOString();
      
      const { data: allMessages } = await hybridMessageStore.getAll({ limit: 1000, userId: req.userId });
      const messages = allMessages.filter((m: any) => {
        const timestamp = m.created_at || m.timestamp;
        return timestamp >= startISO && timestamp < endISO;
      });
      
      const { data: allActions } = await hybridActionItems.getAll({ limit: 1000, userId: req.userId });
      const completedTasks = allActions.filter((a: any) => {
        const completed = a.completed_at || a.completedAt;
        return completed && completed >= startISO && completed < endISO;
      });
      
      summaries.push({
        date: date.toISOString(),
        messageCount: messages.length,
        tasksCompleted: completedTasks.length
      });
    }
    
    res.json({
      success: true,
      data: summaries,
      storage: hybridMessageStore.getStorageType()
    });
  } catch (error: any) {
    console.error('Error generating week summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
