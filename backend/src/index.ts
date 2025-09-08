import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import { RAGService } from './services/rag.service';
import uploadRoutes from './api/routes/upload';

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
app.use('/api/upload', uploadRoutes);

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
      
// REPLACE the memory filtering section in index.ts
// Find this around line 85-120 and replace with:

if (relevantMemories.length > 0) {
  logger.info(`Found ${relevantMemories.length} relevant memories`);
  
  // DEBUG: Log all memories to see what we're working with
  logger.info('🔍 All memories found:');
  relevantMemories.forEach((memory, index) => {
    logger.info(`Memory ${index + 1}: source_type="${memory.metadata?.source_type}", file_name="${memory.metadata?.file_name}", content_start="${memory.content.substring(0, 50)}..."`);
  });
  
  // CORRECTED: Separate file content from conversation history
  const fileMemories = relevantMemories.filter(memory => {
    // Check multiple possible indicators for file content
    const isFileUpload = memory.metadata?.source_type === 'file_upload';
    const hasFileName = memory.metadata?.file_name || memory.metadata?.filename;
    const hasFileType = memory.metadata?.fileType;
    
    return isFileUpload || hasFileName || hasFileType;
  });
  
  const conversationMemories = relevantMemories.filter(memory => {
    // Anything that's NOT a file is conversation
    const isFileUpload = memory.metadata?.source_type === 'file_upload';
    const hasFileName = memory.metadata?.file_name || memory.metadata?.filename;
    const hasFileType = memory.metadata?.fileType;
    
    return !(isFileUpload || hasFileName || hasFileType);
  });
  
  logger.info(`Found ${fileMemories.length} file memories`);
  logger.info(`Found ${conversationMemories.length} conversation memories`);
  
  // Log specific file details for verification
  if (fileMemories.length > 0) {
    fileMemories.forEach((memory, index) => {
      const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'unknown_file';
      const projectId = memory.metadata?.project_id || 'unknown_project';
      const similarity = ((memory.similarity || 0) * 100).toFixed(1);
      logger.info(`📄 File ${index + 1}: ${fileName} (project: ${projectId.substring(0, 8)}..., similarity: ${similarity}%)`);
    });
  }
  
  let contextSections: string[] = [];
  
  // ADD FILE CONTENT FIRST (highest priority)
  if (fileMemories.length > 0) {
    const fileParts = fileMemories.map((memory, index) => {
      const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'archivo_subido';
      const section = memory.metadata?.section || 'contenido';
      const similarity = ((memory.similarity || 0) * 100).toFixed(1);
      const chunkInfo = memory.metadata?.chunkIndex !== undefined ? 
        ` (parte ${memory.metadata.chunkIndex + 1}/${memory.metadata.totalChunks})` : '';
      const projectInfo = memory.metadata?.project_id ? 
        ` [proyecto: ${memory.metadata.project_id.substring(0, 8)}...]` : '';
      
      return `**📄 ${fileName}** ${chunkInfo}${projectInfo}\n📝 Sección: ${section}\n🔍 Relevancia: ${similarity}%\n\n${memory.content}`;
    });
    
    contextSections.push(`--- 📁 ARCHIVOS SUBIDOS (${fileMemories.length} encontrados) ---\n${fileParts.join('\n\n───────────\n\n')}`);
  }
  
  // ADD CONVERSATION HISTORY SECOND (for context)
  if (conversationMemories.length > 0) {
    const conversationParts = conversationMemories.map(memory => {
      const similarity = ((memory.similarity || 0) * 100).toFixed(1);
      const source = memory.metadata?.source_collection || 'conversación';
      const timestamp = memory.metadata?.timestamp || 'tiempo desconocido';
      
      return `[${similarity}% similitud | ${source} | ${timestamp}]\n${memory.content}`;
    });
    
    contextSections.push(`--- 💬 CONTEXTO CONVERSACIONAL (${conversationMemories.length} encontrados) ---\n${conversationParts.join('\n\n---\n\n')}`);
  }
  
  // BUILD FINAL CONTEXT with clear instructions
  if (contextSections.length > 0) {
    contextualMemory = `\n\n${contextSections.join('\n\n═══════════════════════════════════════\n\n')}\n\n--- FIN INFORMACIÓN DISPONIBLE ---\n\n`;
    
    logger.info(`📤 Injecting ${contextualMemory.length} characters of context`);
    logger.info(`🎯 Final summary: ${fileMemories.length} archivos, ${conversationMemories.length} conversaciones`);
  }
} else {
  logger.info('❌ No relevant context found in any project');
}
    } catch (ragError) {
      logger.warn('RAG search failed, continuing without context:', ragError);
    }

    // 5. Build messages for Claude with injected context
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // 6. IMPROVED: Inject context with clear instructions to Claude
    if (claudeMessages.length > 0 && contextualMemory) {
      const lastUserIndex = claudeMessages.length - 1;
      if (claudeMessages[lastUserIndex].role === 'user') {
        // Check if we have file content to prioritize
        const hasFileContent = relevantMemories.some(memory => 
          memory.metadata.source_type === 'file_upload'
        );
        
        const instruction = hasFileContent 
          ? `${contextualMemory}\n🎯 INSTRUCCIÓN IMPORTANTE: Tienes acceso a archivos que el usuario ha subido (marcados con 📄). Usa PRIORITARIAMENTE la información de estos archivos para responder la siguiente pregunta. Si la pregunta se refiere a contenido de archivos, cita específicamente de qué archivo proviene la información.\n\nPregunta del usuario:\n${claudeMessages[lastUserIndex].content}`
          : `${contextualMemory}\nBasándote en el contexto conversacional anterior, responde:\n\n${claudeMessages[lastUserIndex].content}`;
        
        claudeMessages[lastUserIndex].content = instruction;
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
    features: ['RAG Integration', 'Persistent Memory', 'Cross-Project Context', 'File Upload Support']
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
  logger.info('📁 File upload integration enabled');
});

export default app;
