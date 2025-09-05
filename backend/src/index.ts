import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import { RAGService } from './services/rag.service';

dotenv.config();

const app = express();
const port = process.env.BACKEND_PORT || 3001;
const logger = createLogger();
const dbService = new DatabaseService();
const ragService = new RAGService();

// Connect to database
dbService.connect().catch(err => logger.error('DB connection failed:', err));

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Chat routes
app.use('/api/chat', require('./api/routes/chat').default);

// Conversations endpoints
app.get('/api/conversations', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversations = await dbService.getConversations();
    res.json({ conversations });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/conversations', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, project_id } = req.body;
    const conversation = await dbService.createConversation(title || 'New Conversation', project_id);
    res.json(conversation);
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Messages endpoint with RAG integration
app.post('/api/conversations/:id/messages', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Message content required' });
      return;
    }

    logger.info(`Processing message for conversation ${conversationId}`);

    // 1. Save user message
    const userMessage = await dbService.addMessage(conversationId, 'user', content);
    
    // 2. Get recent messages from current conversation
    const recentMessages = await dbService.getMessages(conversationId, 5);
    
    // 3. Initialize variables for RAG
    let relevantMemories: any[] = [];
    let contextualMemory: string = '';
    
    // 4. Search for semantic context across ALL projects
    try {
      logger.info('Searching for relevant context across all projects...');
      relevantMemories = await ragService.searchAllProjects(content, 8);
      
      if (relevantMemories.length > 0) {
        logger.info(`Found ${relevantMemories.length} relevant memories`);
        
        // Build structured context
        const contextParts = relevantMemories.map(memory => {
          const similarity = ((memory.similarity || 0) * 100).toFixed(1);
          const source = memory.metadata.source_collection || 'unknown';
          const timestamp = memory.metadata.timestamp || 'unknown';
          
          return `[${similarity}% relevance | ${source} | ${timestamp}]\n${memory.content}`;
        });
        
        contextualMemory = `\n\n--- CONTEXTO HISTÓRICO RELEVANTE ---\n${contextParts.join('\n\n---\n\n')}\n--- FIN CONTEXTO ---\n\n`;
        
        logger.info(`Injecting ${contextualMemory.length} characters of context`);
      } else {
        logger.info('No relevant historical context found');
      }
    } catch (ragError) {
      logger.warn('RAG search failed, continuing without context:', ragError);
    }

    // 5. Build messages for Claude with injected context
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // 6. Inject context into the last user message if exists
    if (claudeMessages.length > 0 && contextualMemory) {
      const lastUserIndex = claudeMessages.length - 1;
      if (claudeMessages[lastUserIndex].role === 'user') {
        claudeMessages[lastUserIndex].content = contextualMemory + claudeMessages[lastUserIndex].content;
      }
    }

    // 7. Send to Claude API
    const { ClaudeService } = require('./services/claude.service');
    const claudeService = new ClaudeService();
    
    logger.info('Sending to Claude API with context...');
    const claudeResponse = await claudeService.sendMessage(claudeMessages);
    const assistantContent = claudeResponse.content[0]?.text || 'Sorry, could not generate response.';

    // 8. Save Claude's response
    const assistantMessage = await dbService.addMessage(conversationId, 'assistant', assistantContent, { 
      model: claudeResponse.model,
      usage: claudeResponse.usage,
      context_used: relevantMemories?.length || 0
    });

    // 9. Store new messages in ChromaDB for future searches
    try {
      // Use project_id if exists, otherwise use 'general'
      const conversation = await dbService.getConversationById(conversationId);
      const projectId = conversation?.project_id || 'general';
      
      // Store user message
      await ragService.addMemory(
        projectId, 
        conversationId, 
        content,
        { 
          role: 'user',
          timestamp: new Date().toISOString(),
          conversation_title: conversation?.title || 'Untitled'
        }
      );

      // Store assistant response
      await ragService.addMemory(
        projectId, 
        conversationId, 
        assistantContent,
        { 
          role: 'assistant',
          timestamp: new Date().toISOString(),
          conversation_title: conversation?.title || 'Untitled',
          model: claudeResponse.model
        }
      );

      logger.info('Stored messages in ChromaDB for future context');
    } catch (storageError) {
      logger.warn('Failed to store in ChromaDB:', storageError);
    }

    // 10. Respond to frontend
    res.json({
      user_message: userMessage,
      assistant_message: assistantMessage,
      usage: claudeResponse.usage,
      context_memories_used: relevantMemories?.length || 0
    });

    logger.info(`Message processed successfully. Context memories used: ${relevantMemories?.length || 0}`);

  } catch (error) {
    logger.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Health check endpoints
app.get('/api/health', async (req, res) => {
  const ragHealth = await ragService.healthCheck();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      database: 'connected',
      chromadb: ragHealth ? 'healthy' : 'unhealthy'
    }
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'Claude Infinito v1.1 Backend',
    version: '1.1.0',
    features: ['RAG Integration', 'Persistent Memory', 'Cross-Project Context']
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Claude Infinito v1.1 Backend - Memory Enabled', 
    status: 'running'
  });
});

app.listen(port, () => {
  logger.info(`🚀 Claude Infinito Backend running on port ${port}`);
  logger.info('🧠 RAG-enabled memory system active');
});

export default app;
