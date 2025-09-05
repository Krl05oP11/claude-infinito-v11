import express from 'express';
import { DatabaseService } from '../../services/database.service';
import { ClaudeService } from '../../services/claude.service';
import { createLogger } from '../../utils/logger';

const router = express.Router();
const dbService = new DatabaseService();
const claudeService = new ClaudeService();
const logger = createLogger();

// Initialize database connection
dbService.connect().catch(err => logger.error('DB connection failed:', err));

// ✅ CORREGIDO: Get all conversations (sin parámetro projectId)
router.get('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // El método getConversations() no acepta parámetros
    const conversations = await dbService.getConversations();
    
    // Si se necesita filtrar por proyecto, se puede hacer aquí
    const projectId = req.query.project_id as string;
    let filteredConversations = conversations;
    
    if (projectId && projectId !== 'default') {
      filteredConversations = conversations.filter(conv => conv.project_id === projectId);
    }
    
    res.json(filteredConversations);
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ✅ CORREGIDO: Create new conversation (parámetros en orden correcto)
router.post('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { project_id = 'default', title } = req.body;
    
    // createConversation(title, projectId) - orden correcto
    const conversation = await dbService.createConversation(title, project_id);
    res.json(conversation);
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// ✅ CORREGIDO: Get conversation with messages (getConversationById)
router.get('/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    
    // getConversationById() es el método correcto
    const conversation = await dbService.getConversationById(conversationId);
    
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    
    const messages = await dbService.getMessages(conversationId);
    res.json({ conversation, messages });
  } catch (error) {
    logger.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Send message to conversation
router.post('/:id/messages', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const { content } = req.body;
    
    if (!content) {
      res.status(400).json({ error: 'Message content required' });
      return;
    }
    
    // Save user message
    const userMessage = await dbService.addMessage(conversationId, 'user', content);
    
    // Get recent messages for context
    const recentMessages = await dbService.getMessages(conversationId, 10);
    
    // Prepare messages for Claude
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    
    // Get Claude response
    const claudeResponse = await claudeService.sendMessage(claudeMessages);
    const assistantContent = claudeResponse.content[0]?.text || 'Sorry, I could not generate a response.';
    
    // Save Claude's response
    const assistantMessage = await dbService.addMessage(
      conversationId, 
      'assistant', 
      assistantContent,
      { 
        model: claudeResponse.model,
        usage: claudeResponse.usage 
      }
    );
    
    res.json({
      user_message: userMessage,
      assistant_message: assistantMessage,
      usage: claudeResponse.usage
    });
  } catch (error) {
    logger.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

export default router;

