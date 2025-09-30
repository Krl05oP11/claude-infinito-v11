//-------------------index.ts
//-------------------index.ts
//-------------------index.ts
//-------------------index.ts
//-------------------index.ts
// FASE 3 INTEGRADA: Conversational RAG System v3.0
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createLogger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import ragService from './services/rag.service';
import uploadRoutes from './api/routes/upload';

// ============================================================
// NUEVOS IMPORTS - CONVERSATIONAL RAG SYSTEM
// ============================================================
import { QueryRouterService } from './services/query-router.service';
import { ConversationalRAGService } from './services/conversational-rag.service';
import { KnowledgeBaseRAGService } from './services/knowledge-base-rag.service';

dotenv.config({ path: "../.env" });

const app = express();
const port = process.env.BACKEND_PORT || 3001;
const logger = createLogger();
const dbService = new DatabaseService();

// ============================================================
// INICIALIZACION DE SERVICIOS RAG
// ============================================================

// Crear Pool separado para servicios RAG (necesitan conexiones concurrentes)
const ragPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'claude_user',
  password: process.env.DB_PASSWORD || 'claude_password',
  database: process.env.DB_NAME || 'claude_infinito'
});

const queryRouter = new QueryRouterService(ragPool);
const conversationalRAG = new ConversationalRAGService(
  ragPool,
  process.env.OLLAMA_HOST || 'host.docker.internal',
  parseInt(process.env.OLLAMA_PORT || '11434')
);
const knowledgeBaseRAG = new KnowledgeBaseRAGService(
  ragPool,
  process.env.OLLAMA_HOST || 'host.docker.internal',
  parseInt(process.env.OLLAMA_PORT || '11434')
);

logger.info('✅ Servicios Conversational RAG inicializados');

// ================================================================================================
// FUNCIONES AUXILIARES - EXTRAIDAS PARA MEJOR ORGANIZACION
// ================================================================================================

/**
 * Detecta si una pregunta está relacionada con archivos subidos
 * @param content - Contenido del mensaje del usuario
 * @returns true si la pregunta se refiere a archivos
 */
function isFileRelatedQuestion(content: string): boolean {
  console.log('🔍 DETECTION DEBUG - Input:', content);
  
  const fileKeywords = [
    'archivo', 'document', 'pdf', 'file', 'libro', 'book',
    'qué dice', 'what does', 'según el', 'según', 'according to',
    'en el documento', 'in the document', 'texto', 'contenido',
    'explica', 'explains', 'menciona', 'mentions', 'describe',
    'fancyhdr', 'package', 'latex'
  ];
  
  const lowerContent = content.toLowerCase();
  console.log('🔍 DETECTION DEBUG - Lowercase:', lowerContent);
  
  for (const keyword of fileKeywords) {
    if (lowerContent.includes(keyword)) {
      console.log('🔍 DETECTION DEBUG - MATCH:', keyword);
      return true;
    }
  }
  
  console.log('🔍 DETECTION DEBUG - NO MATCH');
  return false;
}

/**
 * Extrae palabras clave relevantes de una pregunta para filtrado de contexto
 * @param content - Contenido del mensaje del usuario  
 * @returns Array de keywords relevantes (máximo 8)
 */
function extractQuestionKeywords(content: string): string[] {
  // Palabras vacías que se deben ignorar
  const stopWords = [
    // Español básico
    'que', 'qué', 'el', 'la', 'de', 'en', 'y', 'a', 'un', 'una', 'es', 'se', 'no', 
    'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'como', 'pero', 
    'sus', 'del', 'las', 'los', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
    'desde', 'hasta', 'cuando', 'donde', 'quien', 'cual', 'cuales', 'muy', 'más', 
    'menos', 'también', 'tan', 'tanto', 'toda', 'todo', 'todos', 'todas',
    'me', 'mi', 'mis', 'nos', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
    
    // Verbos comunes
    'ser', 'estar', 'tener', 'hacer', 'poder', 'decir', 'ir', 'ver', 'dar', 
    'saber', 'querer', 'llegar', 'poner', 'parecer', 'seguir', 'encontrar',
    
    // Palabras genéricas de conversación
    'hola', 'claude', 'resume', 'resumen', 'unas', 'pocas', 'líneas', 'cuáles', 
    'ventajas', 'debes', 'debe', 'debo', 'tener', 'acceso',
    
    // English básico
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 
    'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new'
  ];
  
  // Palabras clave importantes que siempre se deben preservar
  const importantKeywords = [
    // Autores y nombres propios
    'mitchell', 'melanie', 'darwin', 'holland', 'goldberg', 'koza', 'fogel',
    
    // Términos técnicos de algoritmos genéticos
    'algoritmos', 'genéticos', 'genetic', 'algorithm', 'algorithms',
    'fitness', 'selección', 'selection', 'mutación', 'mutation', 'crossover',
    'población', 'population', 'generación', 'generation', 'cromosoma', 'chromosome',
    'evolución', 'evolution', 'adaptación', 'adaptation', 'supervivencia', 'survival',
    
    // Términos de machine learning
    'machine', 'learning', 'aprendizaje', 'automático', 'inteligencia', 'artificial',
    'clustering', 'clasificación', 'regresión', 'neural', 'redes', 'networks',
    'elbow', 'method', 'método', 'codo', 'kmeans', 'svm', 'bayes',
    
    // Términos de documentos
    'libro', 'capítulo', 'página', 'sección', 'documento', 'archivo', 'pdf', 'text',
    'paper', 'artículo', 'investigación', 'estudio', 'análisis',
    
    // Conceptos específicos
    'optimización', 'optimization', 'búsqueda', 'search', 'heurística', 'heuristic',
    'convergencia', 'convergence', 'diversidad', 'diversity', 'exploración', 'exploration'
  ];
  
  // Procesar y limpiar el contenido
  const words = content
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
  
  const extractedKeywords: string[] = [];
  
  // 1. Primero: palabras importantes identificadas específicamente
  words.forEach(word => {
    if (importantKeywords.includes(word) && !extractedKeywords.includes(word)) {
      extractedKeywords.push(word);
    }
  });
  
  // 2. Segundo: sustantivos técnicos que no están en stop words
  words.forEach(word => {
    if (word.length >= 4 && 
        !stopWords.includes(word) && 
        !importantKeywords.includes(word) &&
        !extractedKeywords.includes(word) &&
        extractedKeywords.length < 8) {
      
      // Priorizar palabras que parecen técnicas o específicas
      if (word.includes('tion') || word.includes('sion') || word.includes('ción') ||
          word.includes('ment') || word.includes('ness') || word.includes('ismo') ||
          word.includes('idad') || word.includes('encia') || word.includes('ancia')) {
        extractedKeywords.push(word);
      }
    }
  });
  
  // 3. Tercero: otras palabras relevantes si aún necesitamos más
  if (extractedKeywords.length < 5) {
    words.forEach(word => {
      if (word.length >= 4 && 
          !stopWords.includes(word) && 
          !extractedKeywords.includes(word) &&
          extractedKeywords.length < 8) {
        extractedKeywords.push(word);
      }
    });
  }
  
  return extractedKeywords.slice(0, 8);
}

/**
 * Detecta si el historial de conversación contiene respuestas contradictorias
 * que podrían causar problemas al inyectar contexto de archivos
 * @param messages - Mensajes recientes de la conversación
 * @returns true si se detectan contradicciones
 */
function hasContradictoryHistory(messages: any[]): boolean {
  return messages.some(msg => {
    if (msg.role !== 'assistant') return false;
    
    const content = msg.content.toLowerCase();
    return (
      content.includes('no veo archivos') ||
      content.includes('no tengo acceso') ||
      content.includes('no puedo acceder') ||
      content.includes('sorry, could not generate') ||
      content.includes('no dispongo de') ||
      content.includes('content": []') ||
      content.includes('cannot generate response')
    );
  });
}

/**
 * Construye el contexto de archivos basado en la estrategia seleccionada
 * @param strategy - Estrategia de contexto (full, filtered, minimal, standard)
 * @param fileMemories - Memorias de archivos encontradas
 * @param conversationMemories - Memorias de conversaciones encontradas
 * @param currentProjectId - ID del proyecto actual
 * @returns Contexto construido como string
 */
function buildContextualMemory(
  strategy: string,
  fileMemories: any[],
  conversationMemories: any[],
  currentProjectId: string
): string {
  const contextSections: string[] = [];
  
  if (strategy === 'full' || strategy === 'standard') {
    // Contexto completo para primera pregunta o seguimiento estándar
    if (fileMemories.length > 0) {
      const priorityFileMemories = fileMemories.slice(0, 6);
      const fileParts = priorityFileMemories.map((memory, index) => {
        const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'archivo_subido';
        const section = memory.metadata?.section || 'contenido';
        const similarity = ((memory.metadata?.similarity || 0) * 100).toFixed(1);
        const chunkInfo = memory.metadata?.chunkIndex !== undefined ? 
          ` (parte ${memory.metadata.chunkIndex + 1}/${memory.metadata.totalChunks})` : '';
        const projectId = memory.metadata?.project_id || memory.metadata?.conversation_id || 'unknown';
        const isCurrent = projectId === currentProjectId ? 'PROYECTO ACTUAL' : 'OTRO PROYECTO';
        const projectInfo = ` [${isCurrent}]`;
        
        return `**${fileName}** ${chunkInfo}${projectInfo}\nSeccion: ${section}\nRelevancia: ${similarity}%\n\n${memory.content}`;
      });
      
      contextSections.push(`--- ARCHIVOS SUBIDOS (${priorityFileMemories.length} encontrados) ---\n${fileParts.join('\n\n────────────\n\n')}`);
    }
    
    // Agregar contexto conversacional si es necesario
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
      
      contextSections.push(`--- CONTEXTO CONVERSACIONAL (${priorityConversationMemories.length} encontrados) ---\n${conversationParts.join('\n\n---\n\n')}`);
    }
  } else if (strategy === 'filtered' || strategy === 'minimal') {
    // Contexto enfocado para preguntas específicas de seguimiento
    if (fileMemories.length > 0) {
      const focusedMemories = fileMemories.slice(0, 3);
      const fileParts = focusedMemories.map(memory => {
        const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'archivo_subido';
        const section = memory.metadata?.section || 'contenido';
        return `**${fileName}** - ${section}\n\n${memory.content}`;
      });
      
      contextSections.push(`--- CONTENIDO RELEVANTE ---\n${fileParts.join('\n\n---\n\n')}`);
    }
  }
  
  if (contextSections.length > 0) {
    return `\n\n${contextSections.join('\n\n════════════════════════════════════\n\n')}\n\n--- FIN INFORMACION DISPONIBLE ---\n\n`;
  }
  
  return '';
}

// ================================================================================================
// CONFIGURACION DE LA APLICACION
// ================================================================================================

// Conectar a la base de datos
dbService.connect().catch(err => logger.error('Error de conexión a BD:', err));

// Middleware de seguridad y optimización
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rutas de upload
app.use('/api/upload', uploadRoutes);

// Rutas de chat (legacy)
app.use('/api/chat', require('./api/routes/chat').default);

// ================================================================================================
// ENDPOINTS DE CONVERSACIONES
// ================================================================================================

/**
 * Obtiene todas las conversaciones del usuario
 */
app.get('/api/conversations', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversations = await dbService.getConversations();
    res.json({ conversations });
  } catch (error) {
    logger.error('Error al obtener conversaciones:', error);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

/**
 * Crea una nueva conversación
 */
app.post('/api/conversations', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, project_id } = req.body;
    const conversation = await dbService.createConversation(
      title || 'Nueva Conversación', 
      project_id
    );
    res.json(conversation);
  } catch (error) {
    logger.error('Error al crear conversación:', error);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

/**
 * Obtiene una conversación específica por ID
 */
app.get('/api/conversations/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const conversation = await dbService.getConversationById(conversationId);
    
    if (!conversation) {
      res.status(404).json({ error: 'Conversación no encontrada' });
      return;
    }
    
    res.json(conversation);
  } catch (error) {
    logger.error('Error al obtener conversación:', error);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

/**
 * Obtiene los mensajes de una conversación específica
 */
app.get('/api/conversations/:id/messages', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const messages = await dbService.getMessages(conversationId);
    res.json({ messages });
  } catch (error) {
    logger.error('Error al obtener mensajes:', error);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// ================================================================================================
// ENDPOINT PRINCIPAL DE MENSAJES - CONVERSATIONAL RAG INTEGRATION
// ================================================================================================

/**
 * Procesa un nuevo mensaje del usuario con Conversational RAG completo
 * FASE 3: Sistema inteligente que combina memoria conversacional y knowledge base
 */
app.post('/api/conversations/:id/messages', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const { content, settings } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Contenido del mensaje requerido' });
      return;
    }

    // Extraer y validar configuración dinámica
    const claudeSettings = settings || {};
    
    logger.info(`Procesando mensaje para conversación ${conversationId}`);
    if (settings) {
      logger.info(`Usando configuración dinámica: temp=${claudeSettings.temperature || 'default'}, promptType=${claudeSettings.promptType || 'none'}`);
    }

    // 1. Guardar mensaje del usuario
    const userMessage = await dbService.addMessage(conversationId, 'user', content);
    
    // 2. Obtener mensajes recientes de la conversación actual
    const recentMessages = await dbService.getMessages(conversationId, 10);
    
    // 3. Obtener información de la conversación para determinar el proyecto actual
    const conversation = await dbService.getConversationById(conversationId);
    const currentProjectId = conversation?.project_id || conversationId;
    
    // ============================================================
    // CONVERSATIONAL RAG - NUEVO SISTEMA INTELIGENTE
    // ============================================================
    
    logger.info('[RAG] Iniciando análisis con QueryRouter...');
    
    // 4. QueryRouter analiza la query y determina estrategia
    const queryContext = await queryRouter.analyzeQuery(
      content,
      conversationId,
      currentProjectId
    );
    
    const searchStrategy = queryRouter.determineSearchStrategy(queryContext);
    queryRouter.logQueryAnalysis(content, queryContext, searchStrategy);
    
    // 5. Ejecutar búsquedas según estrategia determinada
    let conversationalResults: any[] = [];
    let knowledgeResults: any[] = [];
    let contextualMemory: string = '';
    
    try {
      // Búsqueda en memoria conversacional si la estrategia lo indica
      if (searchStrategy.useConversationalRAG) {
        logger.info(`[RAG] Buscando en memoria conversacional (max: ${searchStrategy.maxResults})...`);
        conversationalResults = await conversationalRAG.searchConversations(
          content,
          currentProjectId,
          undefined, // conversationId opcional
          searchStrategy.maxResults,
          searchStrategy.similarityThreshold
        );
        logger.info(`[RAG] Encontradas ${conversationalResults.length} memorias conversacionales`);
      }
      
      // Búsqueda en knowledge base (documentos) si la estrategia lo indica
      if (searchStrategy.useKnowledgeBaseRAG) {
        logger.info(`[RAG] Buscando en knowledge base (max: ${searchStrategy.maxResults})...`);
        knowledgeResults = await knowledgeBaseRAG.searchDocuments(
          content,
          currentProjectId,
          searchStrategy.maxResults,
          searchStrategy.similarityThreshold
        );
        logger.info(`[RAG] Encontrados ${knowledgeResults.length} chunks de documentos`);
      }
      
      // 6. Combinar y construir contexto
      const allResults = [
        ...knowledgeResults.map(r => ({ ...r, source_type: 'knowledge_base' })),
        ...conversationalResults.map(r => ({ ...r, source_type: 'conversation' }))
      ];
      
      if (allResults.length > 0) {
        logger.info(`[RAG] Total de resultados combinados: ${allResults.length}`);
        
        // Separar por tipo para construcción de contexto
        const fileMemories = knowledgeResults;
        const conversationMemories = conversationalResults;
        
        // Usar estrategia para determinar cómo construir el contexto
        const contextStrategy = searchStrategy.useConversationalRAG && searchStrategy.useKnowledgeBaseRAG ? 
          'hybrid' : searchStrategy.useKnowledgeBaseRAG ? 'knowledge_focus' : 'conversation_focus';
        
        contextualMemory = buildContextualMemory(
          contextStrategy,
          fileMemories,
          conversationMemories,
          currentProjectId
        );
        
        if (contextualMemory) {
          logger.info(`[RAG] Contexto construido: ${contextualMemory.length} caracteres`);
        }
      } else {
        logger.info('[RAG] No se encontró contexto relevante');
      }
      
    } catch (ragError) {
      logger.warn('[RAG] Error en búsqueda, continuando sin contexto:', ragError);
    }

    // 7. Construir mensajes para Claude
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // 8. Inyección de contexto si se encontró información relevante
    if (claudeMessages.length > 0 && contextualMemory) {
      const lastUserIndex = claudeMessages.length - 1;
      if (claudeMessages[lastUserIndex].role === 'user') {
        let baseInstruction = '';
        
        // Construir instrucción base según tipo de query
        if (queryContext.type === 'knowledge') {
          baseInstruction = `${contextualMemory}\nINSTRUCCIÓN: Tienes acceso a documentos del usuario. Responde basándote específicamente en el contenido proporcionado arriba.`;
        } else if (queryContext.type === 'conversational') {
          baseInstruction = `${contextualMemory}\nINSTRUCCIÓN: El usuario pregunta sobre conversaciones previas. Usa la información del contexto conversacional proporcionado.`;
        } else if (queryContext.type === 'hybrid') {
          baseInstruction = `${contextualMemory}\nINSTRUCCIÓN: Combina información de documentos y conversaciones previas para responder de manera completa.`;
        } else {
          baseInstruction = `${contextualMemory}\nINFORMACIÓN DISPONIBLE: Usa el contexto proporcionado para responder.`;
        }
        
        // Aplicar prompt personalizado si se proporciona
        let finalInstruction = baseInstruction;
        if (claudeSettings.prompt) {
          finalInstruction = `${baseInstruction}\n\n--- INSTRUCCIONES ADICIONALES ---\n${claudeSettings.prompt}`;
        }
        
        finalInstruction += `\n\nPregunta del usuario:\n${claudeMessages[lastUserIndex].content}`;
        claudeMessages[lastUserIndex].content = finalInstruction;
        
        logger.info(`[RAG] Contexto inyectado - Tipo: ${queryContext.type}, Intent: ${queryContext.intent}`);
      }
    }

    // 9. Enviar a Claude API con configuración dinámica
    const { ClaudeService } = require('./services/claude.service');
    const claudeService = new ClaudeService();
    
    // Validar configuración antes de enviar
    const validation = claudeService.validateSettings(claudeSettings);
    if (!validation.valid) {
      logger.warn('Configuración Claude inválida proporcionada:', validation.errors);
      res.status(400).json({ error: 'Configuración inválida', details: validation.errors });
      return;
    }
    
    logger.info('Estado de API Key: CONFIGURADA');
    logger.info('Enviando a Claude API con contexto...');
    
    const claudeResponse = await claudeService.sendMessage(claudeMessages, claudeSettings);
    const assistantContent = claudeResponse.content[0]?.text || 'Lo siento, no se pudo generar una respuesta.';

    // 10. Guardar respuesta de Claude con metadatos de configuración
    const assistantMessage = await dbService.addMessage(conversationId, 'assistant', assistantContent, { 
      model: claudeResponse.model,
      usage: claudeResponse.usage,
      context_used: (conversationalResults.length + knowledgeResults.length),
      query_type: queryContext.type,
      query_intent: queryContext.intent,
      settings_used: claudeSettings
    });

    // ============================================================
    // ALMACENAMIENTO POST-RESPUESTA - CONVERSATIONAL RAG
    // ============================================================
    
    try {
      logger.info('[RAG] Almacenando par conversacional para futuras búsquedas...');
      
      await conversationalRAG.storeConversationPair(
        conversationId,
        currentProjectId,
        userMessage.id,
        content,
        assistantMessage.id,
        assistantContent
      );
      
      logger.info('✅ Par conversacional almacenado exitosamente');
    } catch (storageError) {
      logger.warn('⚠️ Fallo al almacenar par conversacional:', storageError);
    }

    // 11. Logging final
    logger.info(`✅ Mensaje procesado exitosamente`);
    logger.info(`   - Tipo de query: ${queryContext.type}`);
    logger.info(`   - Intent: ${queryContext.intent}`);
    logger.info(`   - Memorias conversacionales: ${conversationalResults.length}`);
    logger.info(`   - Documentos: ${knowledgeResults.length}`);
    logger.info(`   - Contexto total: ${conversationalResults.length + knowledgeResults.length} items`);

    // 12. Responder con información completa
    res.json({
      user_message: userMessage,
      assistant_message: assistantMessage,
      usage: claudeResponse.usage,
      context_memories_used: conversationalResults.length + knowledgeResults.length,
      query_analysis: {
        type: queryContext.type,
        intent: queryContext.intent,
        confidence: queryContext.confidence
      },
      settings_applied: claudeSettings,
      success: true
    });

  } catch (error) {
    logSystemError(error, 'procesamiento de mensajes');
    res.status(500).json({ error: 'Fallo al procesar mensaje' });
  }
});

// ================================================================================================
// ENDPOINTS DE CONFIGURACION Y ESTADO
// ================================================================================================

/**
 * Obtiene opciones de configuración disponibles para Claude
 */
app.get('/api/claude/config', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { ClaudeService } = require('./services/claude.service');
    const claudeAPI = new ClaudeService();
    
    res.json({
      templates: claudeAPI.getPromptTemplates(),
      defaults: claudeAPI.getDefaultSettings(),
      limits: {
        temperature: { min: 0, max: 1, step: 0.1 },
        maxTokens: { min: 100, max: 8000, step: 100 }
      }
    });
  } catch (error) {
    logger.error('Error obteniendo configuración Claude:', error);
    res.status(500).json({ error: 'Fallo al obtener configuración' });
  }
});

/**
 * Endpoint de verificación de salud del sistema
 */
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      database: 'conectada',
      conversational_rag: 'activo',
      knowledge_base_rag: 'activo',
      query_router: 'activo'
    }
  });
});

/**
 * Información sobre la aplicación
 */
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Claude Infinito v1.1 Backend',
    version: '1.1.0',
    features: [
      'Conversational RAG System', 
      'Knowledge Base RAG', 
      'Query Router Inteligente',
      'Memoria Persistente', 
      'Contexto Cross-Proyecto', 
      'Soporte Upload de Archivos', 
      'Gestión Inteligente de Contexto', 
      'Configuración Dinámica'
    ]
  });
});

/**
 * Endpoint raíz con información básica
 */
app.get('/', (req, res) => {
  res.json({ 
    message: 'Claude Infinito v1.1 Backend - Conversational RAG System Activo', 
    status: 'ejecutándose'
  });
});

// ================================================================================================
// SISTEMA DE MONITOREO DE ERRORES
// ================================================================================================

/**
 * Endpoint para obtener información de errores recientes del sistema
 */
app.get('/api/system/errors', (req: express.Request, res: express.Response): void => {
  try {
    const errorInfo = {
      last_error: (global as any).lastSystemError || null,
      error_type: (global as any).lastErrorType || null,
      error_count: (global as any).errorCount || 0,
      last_updated: (global as any).lastErrorTime || null,
      system_status: (global as any).lastSystemError ? 'error' : 'ok'
    };
    
    res.json(errorInfo);
  } catch (error) {
    logger.error('Error obteniendo información de errores del sistema:', error);
    res.status(500).json({ error: 'No se pudo obtener información de errores' });
  }
});

/**
 * Endpoint para limpiar errores del sistema (útil para testing)
 */
app.post('/api/system/errors/clear', (req: express.Request, res: express.Response): void => {
  try {
    (global as any).lastSystemError = null;
    (global as any).lastErrorType = null;
    (global as any).errorCount = 0;
    (global as any).lastErrorTime = null;
    
    logger.info('Errores del sistema limpiados manualmente');
    res.json({ success: true, message: 'Errores del sistema limpiados' });
  } catch (error) {
    logger.error('Error limpiando errores del sistema:', error);
    res.status(500).json({ error: 'No se pudieron limpiar los errores' });
  }
});

/**
 * Función auxiliar para registrar errores del sistema
 * @param error - Error capturado
 * @param context - Contexto donde ocurrió el error
 */
function logSystemError(error: any, context: string): void {
  let errorMessage = 'Error desconocido';
  let errorType = 'unknown';
  
  // Clasificar tipos de errores específicos
  if (error.message?.includes('529') || error.message?.includes('overloaded')) {
    errorMessage = 'API Claude: Servidor sobrecargado';
    errorType = 'api_overload';
  } else if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
    errorMessage = 'API Claude: Error de autenticación';
    errorType = 'auth_error';
  } else if (error.message?.includes('403') || error.message?.includes('forbidden')) {
    errorMessage = 'API Claude: Acceso denegado';
    errorType = 'access_denied';
  } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
    errorMessage = 'API Claude: Límite de velocidad excedido';
    errorType = 'rate_limit';
  } else if (error.message?.includes('500') || error.message?.includes('internal server error')) {
    errorMessage = 'API Claude: Error interno del servidor';
    errorType = 'server_error';
  } else if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
    errorMessage = 'Error de conectividad de red';
    errorType = 'network_error';
  } else if (error.message?.includes('timeout')) {
    errorMessage = 'Timeout de conexión';
    errorType = 'timeout_error';
  } else {
    errorMessage = `Error en ${context}: ${error.message || 'Error desconocido'}`;
    errorType = 'system_error';
  }
  
  // Guardar en variables globales para exposición via API
  (global as any).lastSystemError = errorMessage;
  (global as any).lastErrorType = errorType;
  (global as any).lastErrorTime = new Date().toISOString();
  (global as any).errorCount = ((global as any).errorCount || 0) + 1;
  
  logger.error(`[${context.toUpperCase()}] ${errorMessage}`, error);
}

// ================================================================================================
// INICIALIZACION DEL SERVIDOR
// ================================================================================================

app.listen(port, () => {
  logger.info(`Claude Infinito Backend ejecutándose en puerto ${port}`);
  logger.info('✅ Conversational RAG System ACTIVO');
  logger.info('✅ Knowledge Base RAG ACTIVO');
  logger.info('✅ Query Router ACTIVO');
  logger.info('Integración de upload de archivos habilitada');
  logger.info('Gestión inteligente de contexto habilitada');
  logger.info('Soporte de configuración dinámica habilitado');
});

export default app;
