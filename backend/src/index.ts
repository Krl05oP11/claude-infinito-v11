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

// Helper function to detect if this is a file-related question
function isFileRelatedQuestion(content: string): boolean {
  const fileKeywords = ['archivo', 'libro', 'pdf', 'documento', 'text', 'file', 'subí', 'uploaded', 'capítulo', 'página'];
  const lowerContent = content.toLowerCase();
  return fileKeywords.some(keyword => lowerContent.includes(keyword));
}

// Helper function to extract keywords from question for context filtering
function extractQuestionKeywords(content: string): string[] {
  const stopWords = ['que', 'qué', 'el', 'la', 'de', 'en', 'y', 'a', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'como', 'pero', 'sus', 'had', 'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'];
  
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.includes(word))
    .slice(0, 5); // Top 5 keywords
}

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
    const recentMessages = await dbService.getMessages(conversationId, 10); // Increased to better detect context
    
    // 3. Get conversation info to determine current project
    const conversation = await dbService.getConversationById(conversationId);
    const currentProjectId = conversation?.project_id || conversationId;
    
    // 4. ✅ SMART CONTEXT DETECTION: Analyze conversation history for file context
    const isCurrentFileQuestion = isFileRelatedQuestion(content);
    const previousFileQuestions = recentMessages.filter(msg => 
      msg.role === 'user' && isFileRelatedQuestion(msg.content)
    ).length;
    
    const hasEstablishedFileContext = previousFileQuestions > 0;
    const isFirstFileQuestion = previousFileQuestions <= 1 && isCurrentFileQuestion;
    
    logger.info(`📊 Context Analysis: isFileQuestion=${isCurrentFileQuestion}, previousFileQuestions=${previousFileQuestions}, hasEstablishedContext=${hasEstablishedFileContext}, isFirstFileQuestion=${isFirstFileQuestion}`);
    
    // 5. Initialize variables for RAG
    let relevantMemories: any[] = [];
    let contextualMemory: string = '';
    let contextStrategy: string = 'none';
    
    // 6. Search for semantic context with INTELLIGENT STRATEGY
    try {
      if (isCurrentFileQuestion) {
        logger.info('Searching for relevant context across all projects...');
        const allMemories = await ragService.searchAllProjects(content, 20);

        if (allMemories.length > 0) {
          logger.info(`Found ${allMemories.length} total memories across all projects`);
          
          // Separate current project from other projects
          const currentProjectMemories = allMemories.filter(memory => {
            const memoryProjectId = memory.metadata?.project_id || memory.metadata?.conversation_id;
            return memoryProjectId === currentProjectId;
          });
          
          const otherProjectsMemories = allMemories.filter(memory => {
            const memoryProjectId = memory.metadata?.project_id || memory.metadata?.conversation_id;
            return memoryProjectId !== currentProjectId;
          });
          
          logger.info(`Found ${currentProjectMemories.length} memories in CURRENT project`);
          logger.info(`Found ${otherProjectsMemories.length} memories in OTHER projects`);
          
          // PRIORITIZATION LOGIC: Current project FIRST
          let finalMemories: any[] = [];
          
          if (currentProjectMemories.length > 0) {
            finalMemories = [...currentProjectMemories.slice(0, 12)];
            const remainingSlots = Math.max(15 - finalMemories.length, 0);
            if (remainingSlots > 0 && otherProjectsMemories.length > 0) {
              finalMemories = [...finalMemories, ...otherProjectsMemories.slice(0, Math.min(3, remainingSlots))];
            }
            logger.info(`🎯 PRIORITIZED: ${currentProjectMemories.length} from current project, ${Math.min(3, Math.max(15 - currentProjectMemories.slice(0, 12).length, 0))} from other projects`);
          } else {
            finalMemories = otherProjectsMemories.slice(0, 15);
            logger.info(`🔄 FALLBACK: Using ${finalMemories.length} memories from other projects`);
          }
          
          relevantMemories = finalMemories;
          
          // ✅ SMART CONTEXT FILTERING: Filter by question relevance for subsequent questions
          if (hasEstablishedFileContext && !isFirstFileQuestion) {
            const questionKeywords = extractQuestionKeywords(content);
            logger.info(`🔍 FILTERING by keywords: ${questionKeywords.join(', ')}`);
            
            // Filter memories by relevance to specific question
            const keywordFilteredMemories = relevantMemories.filter(memory => {
              const memoryText = memory.content.toLowerCase();
              return questionKeywords.some(keyword => memoryText.includes(keyword));
            });
            
            if (keywordFilteredMemories.length > 0) {
              relevantMemories = keywordFilteredMemories.slice(0, 8); // Reduced for focused context
              contextStrategy = 'filtered';
              logger.info(`🎯 FILTERED to ${relevantMemories.length} relevant memories for specific question`);
            } else {
              relevantMemories = relevantMemories.slice(0, 5); // Even more reduced if no keyword matches
              contextStrategy = 'minimal';
              logger.info(`⚠️ No keyword matches, using minimal context (${relevantMemories.length} memories)`);
            }
          } else {
            contextStrategy = isFirstFileQuestion ? 'full' : 'standard';
          }
          
          // Separate file content from conversation history
          const fileMemories = relevantMemories.filter(memory => {
            const sourceType = memory.metadata?.source_type;
            const fileName = memory.metadata?.file_name || memory.metadata?.filename;
            const fileType = memory.metadata?.fileType;
            return sourceType === 'file_upload' || fileName || fileType;
          });
          
          const conversationMemories = relevantMemories.filter(memory => {
            const sourceType = memory.metadata?.source_type;
            const fileName = memory.metadata?.file_name || memory.metadata?.filename;
            const fileType = memory.metadata?.fileType;
            return !(sourceType === 'file_upload' || fileName || fileType);
          });
          
          logger.info(`Found ${fileMemories.length} file memories`);
          logger.info(`Found ${conversationMemories.length} conversation memories`);
          
          // File details logging
          if (fileMemories.length > 0) {
            fileMemories.forEach((memory, index) => {
              const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'unknown_file';
              const projectId = memory.metadata?.project_id || memory.metadata?.conversation_id || 'unknown_project';
              const isCurrent = projectId === currentProjectId ? '🎯 CURRENT' : '🔄 OTHER';
              const similarity = ((memory.metadata?.similarity || 0) * 100).toFixed(1);
              logger.info(`📄 File ${index + 1}: ${fileName} ${isCurrent} (similarity: ${similarity}%)`);
            });
          }
          
          // ✅ CONTEXT BUILDING: Adapt based on strategy
          let contextSections: string[] = [];
          
          if (contextStrategy === 'full' || contextStrategy === 'standard') {
            // FULL CONTEXT for first question or standard follow-ups
            if (fileMemories.length > 0) {
              const priorityFileMemories = fileMemories.slice(0, 6);
              const fileParts = priorityFileMemories.map((memory, index) => {
                const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'archivo_subido';
                const section = memory.metadata?.section || 'contenido';
                const similarity = ((memory.metadata?.similarity || 0) * 100).toFixed(1);
                const chunkInfo = memory.metadata?.chunkIndex !== undefined ? 
                  ` (parte ${memory.metadata.chunkIndex + 1}/${memory.metadata.totalChunks})` : '';
                const projectId = memory.metadata?.project_id || memory.metadata?.conversation_id || 'unknown';
                const isCurrent = projectId === currentProjectId ? '🎯 PROYECTO ACTUAL' : '🔄 OTRO PROYECTO';
                const projectInfo = ` [${isCurrent}]`;
                
                return `**📄 ${fileName}** ${chunkInfo}${projectInfo}\n🔍 Sección: ${section}\n🎯 Relevancia: ${similarity}%\n\n${memory.content}`;
              });
              
              contextSections.push(`--- 📁 ARCHIVOS SUBIDOS (${priorityFileMemories.length} encontrados) ---\n${fileParts.join('\n\n─────────────\n\n')}`);
            }
            
            // Add conversation context if needed
            const maxTotalMemories = 8;
            const usedSlots = Math.min(fileMemories.length, 6);
            const conversationSlots = Math.min(Math.max(maxTotalMemories - usedSlots, 0), 2);
            
            if (conversationMemories.length > 0 && conversationSlots > 0) {
              const priorityConversationMemories = conversationMemories.slice(0, conversationSlots);
              const conversationParts = priorityConversationMemories.map(memory => {
                const similarity = ((memory.metadata?.similarity || 0) * 100).toFixed(1);
                const timestamp = memory.metadata?.timestamp || 'tiempo desconocido';
                return `[${similarity}% similitud | ${timestamp}]\n${memory.content}`;
              });
              
              contextSections.push(`--- 💬 CONTEXTO CONVERSACIONAL (${priorityConversationMemories.length} encontrados) ---\n${conversationParts.join('\n\n---\n\n')}`);
            }
          } else if (contextStrategy === 'filtered' || contextStrategy === 'minimal') {
            // FOCUSED CONTEXT for specific follow-up questions
            if (fileMemories.length > 0) {
              const focusedMemories = fileMemories.slice(0, 3); // Reduced number
              const fileParts = focusedMemories.map(memory => {
                const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'archivo_subido';
                const section = memory.metadata?.section || 'contenido';
                return `**📄 ${fileName}** - ${section}\n\n${memory.content}`;
              });
              
              contextSections.push(`--- 🎯 CONTENIDO RELEVANTE ---\n${fileParts.join('\n\n---\n\n')}`);
            }
          }
          
          // Build final context
          if (contextSections.length > 0) {
            contextualMemory = `\n\n${contextSections.join('\n\n════════════════════════════════════════\n\n')}\n\n--- FIN INFORMACIÓN DISPONIBLE ---\n\n`;
            
            logger.info(`📤 Injecting ${contextualMemory.length} characters of context (strategy: ${contextStrategy})`);
            logger.info(`🎯 Final summary: ${fileMemories.length} archivos, ${conversationMemories.length} conversaciones`);
          }
        } else {
          logger.info('❌ No relevant context found in any project');
        }
      } else {
        logger.info('ℹ️ Non-file question, skipping file context search');
      }
    } catch (ragError) {
      logger.warn('RAG search failed, continuing without context:', ragError);
    }

    // 7. Build messages for Claude
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // 8. ✅ INTELLIGENT CONTEXT INJECTION based on conversation state
    if (claudeMessages.length > 0 && isCurrentFileQuestion) {
      const lastUserIndex = claudeMessages.length - 1;
      if (claudeMessages[lastUserIndex].role === 'user') {
        let instruction: string;
        
        if (contextStrategy === 'full') {
          // First file question - full context
          instruction = `${contextualMemory}\n🎯 INSTRUCCIÓN IMPORTANTE: Tienes acceso a archivos que el usuario ha subido al PROYECTO ACTUAL (marcados con 🎯 PROYECTO ACTUAL). USA PRIORITARIAMENTE la información de estos archivos del proyecto actual para responder. Si la pregunta se refiere a contenido de archivos, cita específicamente de qué archivo del proyecto actual proviene la información.\n\nPregunta del usuario:\n${claudeMessages[lastUserIndex].content}`;
        } else if (contextStrategy === 'filtered') {
          // Subsequent specific question - focused context
          instruction = `${contextualMemory}\n🔍 INSTRUCCIÓN: Ya tienes el contexto del archivo. La pregunta específica del usuario se refiere a: "${content}". Enfócate en responder específicamente esta nueva pregunta basándote en el contenido más relevante del archivo.\n\nPregunta específica:\n${claudeMessages[lastUserIndex].content}`;
        } else if (contextStrategy === 'minimal') {
          // Follow-up with minimal context
          instruction = `${contextualMemory}\n💡 INSTRUCCIÓN: Responde la nueva pregunta específica del usuario basándote en el archivo que ya conoces del contexto de la conversación.\n\nNueva pregunta:\n${claudeMessages[lastUserIndex].content}`;
        } else {
          // Standard strategy
          instruction = `${contextualMemory}\n📄 INFORMACIÓN: Tienes acceso a archivos subidos. Responde basándote en el contenido disponible.\n\nPregunta del usuario:\n${claudeMessages[lastUserIndex].content}`;
        }
        
        claudeMessages[lastUserIndex].content = instruction;
        logger.info(`🎯 Applied context injection strategy: ${contextStrategy}`);
      }
    }

    // 9. Send to Claude API
    const { ClaudeService } = require('./services/claude.service');
    const claudeService = new ClaudeService();
    
    logger.info('API Key status: CONFIGURED');
    logger.info('Sending to Claude API with context...');
    const claudeResponse = await claudeService.sendMessage(claudeMessages);
    const assistantContent = claudeResponse.content[0]?.text || 'Sorry, could not generate response.';

    // 10. Save Claude's response
    const assistantMessage = await dbService.addMessage(conversationId, 'assistant', assistantContent, { 
      model: claudeResponse.model,
      usage: claudeResponse.usage,
      context_used: relevantMemories?.length || 0,
      context_strategy: contextStrategy
    });

    // 11. Store new messages in ChromaDB for future searches
    try {
      const projectId = conversation?.project_id || conversationId;
      
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

    // 12. Respond to frontend
    res.json({
      user_message: userMessage,
      assistant_message: assistantMessage,
      usage: claudeResponse.usage,
      context_memories_used: relevantMemories?.length || 0,
      context_strategy: contextStrategy
    });

    logger.info(`Message processed successfully. Context memories used: ${relevantMemories?.length || 0}, Strategy: ${contextStrategy}`);

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
    features: ['RAG Integration', 'Persistent Memory', 'Cross-Project Context', 'File Upload Support', 'Intelligent Context Management']
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
  logger.info('🎯 Intelligent context management enabled');
});

export default app;

