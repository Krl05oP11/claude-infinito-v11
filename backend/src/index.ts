//-------------------index.ts
// Claude Infinito v1.1 Backend
// FASE 3: Conversational RAG System v3.0 con Métricas y Anti-Contradicciones
// Última actualización: 23/10/2025
//-------------------

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createLogger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import { RAGService } from './services/rag.service';
import uploadRoutes from './api/routes/upload';

// Sistema de comandos (GPU status)
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Servicios RAG
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
// FUNCIONES AUXILIARES - DETECCIÓN Y PROCESAMIENTO
// ================================================================================================

/**
 * Detecta si una pregunta está relacionada con archivos subidos
 * @param content - Contenido del mensaje del usuario
 * @returns true si la pregunta se refiere a archivos
 */
function isFileRelatedQuestion(content: string): boolean {
  const fileKeywords = [
    'archivo', 'document', 'pdf', 'file', 'libro', 'book',
    'qué dice', 'what does', 'según el', 'según', 'according to',
    'en el documento', 'in the document', 'texto', 'contenido',
    'explica', 'explains', 'menciona', 'mentions', 'describe',
    'fancyhdr', 'package', 'latex'
  ];
  
  const lowerContent = content.toLowerCase();
  return fileKeywords.some(keyword => lowerContent.includes(keyword));
}

/**
 * Extrae palabras clave relevantes de una pregunta para filtrado de contexto
 * Optimizado para términos técnicos y científicos
 * @param content - Contenido del mensaje del usuario  
 * @returns Array de keywords relevantes (máximo 8)
 */
function extractQuestionKeywords(content: string): string[] {
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
  
  const importantKeywords = [
    // Autores y nombres propios
    'mitchell', 'melanie', 'darwin', 'holland', 'goldberg', 'koza', 'fogel', 'bishop',
    // Términos técnicos ML/AI
    'algoritmos', 'genéticos', 'genetic', 'algorithm', 'algorithms',
    'fitness', 'selección', 'selection', 'mutación', 'mutation', 'crossover',
    'población', 'population', 'generación', 'generation', 'cromosoma', 'chromosome',
    'evolución', 'evolution', 'adaptación', 'adaptation', 'supervivencia', 'survival',
    'machine', 'learning', 'aprendizaje', 'automático', 'inteligencia', 'artificial',
    'clustering', 'clasificación', 'regresión', 'neural', 'redes', 'networks',
    'elbow', 'method', 'método', 'codo', 'kmeans', 'svm', 'bayes',
    // Términos de documentos
    'libro', 'capítulo', 'página', 'sección', 'documento', 'archivo', 'pdf', 'text',
    'paper', 'artículo', 'investigación', 'estudio', 'análisis',
    // Conceptos específicos
    'optimización', 'optimization', 'búsqueda', 'search', 'heurística', 'heuristic',
    'convergencia', 'convergence', 'diversidad', 'diversity', 'exploración', 'exploration',
    'patrón', 'patrones', 'pattern', 'patterns', 'reconocimiento', 'recognition'
  ];
  
  const words = content
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
  
  const extractedKeywords: string[] = [];
  
  // 1. Palabras importantes identificadas específicamente
  words.forEach(word => {
    if (importantKeywords.includes(word) && !extractedKeywords.includes(word)) {
      extractedKeywords.push(word);
    }
  });
  
  // 2. Sustantivos técnicos que no están en stop words
  words.forEach(word => {
    if (word.length >= 4 && 
        !stopWords.includes(word) && 
        !importantKeywords.includes(word) &&
        !extractedKeywords.includes(word) &&
        extractedKeywords.length < 8) {
      
      // Priorizar palabras técnicas
      if (word.includes('tion') || word.includes('sion') || word.includes('ción') ||
          word.includes('ment') || word.includes('ness') || word.includes('ismo') ||
          word.includes('idad') || word.includes('encia') || word.includes('ancia')) {
        extractedKeywords.push(word);
      }
    }
  });
  
  // 3. Otras palabras relevantes si necesitamos más
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
 * Construye el contexto de archivos basado en la estrategia seleccionada
 * Soporta múltiples estrategias: full, filtered, minimal, standard, hybrid, knowledge_focus, conversation_focus
 * @param strategy - Estrategia de contexto
 * @param fileMemories - Memorias de archivos encontradas
 * @param conversationMemories - Memorias de conversaciones encontradas
 * @param currentProjectId - ID del proyecto actual
 * @returns Contexto construido como string formateado
 */
function buildContextualMemory(
  strategy: string,
  fileMemories: any[],
  conversationMemories: any[],
  currentProjectId: string
): string {
  const contextSections: string[] = [];
  
  if (strategy === 'full' || strategy === 'standard' || strategy === 'hybrid' || 
      strategy === 'knowledge_focus' || strategy === 'conversation_focus') {
    
    if (fileMemories.length > 0) {
      const priorityFileMemories = fileMemories.slice(0, 6);
      const fileParts = priorityFileMemories.map((memory) => {
        const fileName = memory.metadata?.file_name || memory.metadata?.filename || 'archivo_subido';
        const section = memory.metadata?.section || 'contenido';
        const similarity = ((memory.metadata?.similarity || memory.similarity || 0) * 100).toFixed(1);
        const chunkInfo = memory.metadata?.chunkIndex !== undefined ? 
          ` (parte ${memory.metadata.chunkIndex + 1}/${memory.metadata.totalChunks})` : '';
        const projectId = memory.metadata?.project_id || memory.metadata?.conversation_id || 'unknown';
        const isCurrent = projectId === currentProjectId ? 'PROYECTO ACTUAL' : 'OTRO PROYECTO';
        const projectInfo = ` [${isCurrent}]`;
        
        return `**${fileName}** ${chunkInfo}${projectInfo}\nSeccion: ${section}\nRelevancia: ${similarity}%\n\n${memory.content}`;
      });
      
      contextSections.push(`--- ARCHIVOS SUBIDOS (${priorityFileMemories.length} encontrados) ---\n${fileParts.join('\n\n─────────────\n\n')}`);
    }
    
    const maxTotalMemories = 8;
    const usedSlots = Math.min(fileMemories.length, 6);
    const conversationSlots = Math.min(Math.max(maxTotalMemories - usedSlots, 0), 2);
    
    if (conversationMemories.length > 0 && conversationSlots > 0) {
      const priorityConversationMemories = conversationMemories.slice(0, conversationSlots);
      const conversationParts = priorityConversationMemories.map(memory => {
        const similarity = ((memory.metadata?.similarity || memory.similarity || 0) * 100).toFixed(1);
        const timestamp = memory.metadata?.timestamp || 'tiempo desconocido';
        return `[${similarity}% similitud | ${timestamp}]\n${memory.content}`;
      });
      
      contextSections.push(`--- CONTEXTO CONVERSACIONAL (${priorityConversationMemories.length} encontrados) ---\n${conversationParts.join('\n\n---\n\n')}`);
    }
  } else if (strategy === 'filtered' || strategy === 'minimal') {
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
    return `\n\n${contextSections.join('\n\n════════════════════════════════════════\n\n')}\n\n--- FIN INFORMACION DISPONIBLE ---\n\n`;
  }
  
  return '';
}

/**
 * Obtiene información de la GPU usando nvidia-smi
 * Fallback a Ollama si nvidia-smi no está disponible
 * @returns Objeto con información de GPU (usage, memory, temperature, etc.)
 */
async function getGPUStatus(): Promise<any> {
  try {
    const { stdout: utilizationOutput } = await execAsync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name --format=csv,noheader,nounits'
    );
    
    const lines = utilizationOutput.trim().split('\n');
    if (lines.length > 0) {
      const [usage, memoryUsed, memoryTotal, temperature, name] = lines[0].split(',').map(s => s.trim());
      const isRTX5070Ti = name.includes('5070') || name.includes('4070');
      
      return {
        usage: parseFloat(usage) || 0,
        memory_used: parseInt(memoryUsed) || 0,
        memory_total: parseInt(memoryTotal) || 0,
        temperature: parseInt(temperature) || 0,
        gpu_name: name,
        rtx5070Active: isRTX5070Ti,
        timestamp: new Date().toISOString()
      };
    }
    
    throw new Error('No GPU data available');
  } catch (error) {
    // Fallback: intentar con Ollama
    try {
      const { stdout: ollamaOutput } = await execAsync('ollama ps');
      const isUsingGPU = ollamaOutput.includes('GPU') || ollamaOutput.includes('CUDA');
      const hasModelsLoaded = ollamaOutput.includes('bge-large') || 
                              ollamaOutput.includes('llama') || 
                              ollamaOutput.includes('mistral');
      
      return {
        usage: hasModelsLoaded ? 30 : 0,
        memory_used: 0,
        memory_total: 0,
        temperature: 0,
        gpu_name: 'GPU (Ollama detected)',
        rtx5070Active: isUsingGPU,
        timestamp: new Date().toISOString(),
        source: 'ollama_estimate'
      };
    } catch (ollamaError) {
      throw new Error('GPU information not available');
    }
  }
}

/**
 * Registra errores del sistema con clasificación automática
 * Actualiza variables globales para exposición via API
 * @param error - Error capturado
 * @param context - Contexto donde ocurrió el error
 */
function logSystemError(error: any, context: string): void {
  let errorMessage = 'Error desconocido';
  let errorType = 'unknown';
  
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
  
  (global as any).lastSystemError = errorMessage;
  (global as any).lastErrorType = errorType;
  (global as any).lastErrorTime = new Date().toISOString();
  (global as any).errorCount = ((global as any).errorCount || 0) + 1;
  
  logger.error(`[${context.toUpperCase()}] ${errorMessage}`, error);
}

// ================================================================================================
// CONFIGURACION DE LA APLICACION
// ================================================================================================

dbService.connect().catch(err => logger.error('Error de conexión a BD:', err));

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/upload', uploadRoutes);
app.use('/api/chat', require('./api/routes/chat').default);

// ================================================================================================
// ENDPOINTS DE CONVERSACIONES
// ================================================================================================

app.get('/api/conversations', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversations = await dbService.getConversations();
    res.json({ conversations });
  } catch (error) {
    logger.error('Error al obtener conversaciones:', error);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

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
// ENDPOINT PRINCIPAL DE MENSAJES - CONVERSATIONAL RAG + ANTI-CONTRADICCIONES
// ================================================================================================

/**
 * Procesa un nuevo mensaje del usuario con Conversational RAG completo
 * Incluye detección automática de contradicciones en historial
 * Sistema inteligente que combina memoria conversacional y knowledge base
 */
app.post('/api/conversations/:id/messages', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const { content, settings } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Contenido del mensaje requerido' });
      return;
    }

    // Variables para métricas RAG
    const ragStartTime = Date.now();
    let similarityScores: number[] = [];
    let thresholdUsed = 0.3;
    let avgSimilarity = 0;
    let maxSimilarity = 0;
    let minSimilarity = 0;

    const claudeSettings = settings || {};
    
    logger.info(`Procesando mensaje para conversación ${conversationId}`);
    if (settings) {
      logger.info(`Usando configuración dinámica: temp=${claudeSettings.temperature || 'default'}, promptType=${claudeSettings.promptType || 'none'}`);
    }

    // 1. Guardar mensaje del usuario
    const userMessage = await dbService.addMessage(conversationId, 'user', content);
    
    // 2. Obtener mensajes recientes
    const recentMessages = await dbService.getMessages(conversationId, 10);
    
    // 3. Obtener información de la conversación
    const conversation = await dbService.getConversationById(conversationId);
    const currentProjectId = conversation?.project_id || conversationId;
    
    // ============================================================
    // DETECCIÓN DE CONTRADICCIONES EN HISTORIAL
    // ============================================================
    
    let hasContradictoryHistory = false;
    
    if (recentMessages.length > 0) {
      logger.info('🔍 Checking for contradictions in conversation history...');
      
      const contradictionPatterns = [
        'sorry, could not generate',
        'no tengo acceso',
        'no puedo ver',
        'no veo archivos',
        'no he recibido',
        'no tengo información sobre archivos',
        'no puedo acceder',
        'no dispongo de',
        'no me has proporcionado',
        'no has compartido',
        'no está disponible',
        'cannot access',
        'do not have access',
        'cannot see',
        'haven\'t received'
      ];
      
      recentMessages.forEach((msg, index) => {
        if (msg.role === 'assistant' && !hasContradictoryHistory) {
          const msgContent = msg.content.toLowerCase();
          
          for (const pattern of contradictionPatterns) {
            if (msgContent.includes(pattern)) {
              hasContradictoryHistory = true;
              logger.warn(`⚠️ CONTRADICTION DETECTED in message ${index + 1}: "${pattern}"`);
              logger.warn(`⚠️ Previous response claimed no file access, but files may now be available`);
              break;
            }
          }
        }
      });
      
      if (hasContradictoryHistory) {
        logger.warn('⚠️ CONTRADICTION DETECTED: Conversation history contains file access denial');
        logger.warn('⚠️ SOLUTION: Will skip context injection to avoid confusing Claude');
      } else {
        logger.info('✅ No contradictions detected in conversation history');
      }
    }
    
    // ============================================================
    // CONVERSATIONAL RAG - SISTEMA INTELIGENTE
    // ============================================================
    
    logger.info('[RAG] Iniciando análisis con QueryRouter...');
    
    const queryContext = await queryRouter.analyzeQuery(
      content,
      conversationId,
      currentProjectId
    );
    
    const searchStrategy = queryRouter.determineSearchStrategy(queryContext);
    queryRouter.logQueryAnalysis(content, queryContext, searchStrategy);
    
    let conversationalResults: any[] = [];
    let knowledgeResults: any[] = [];
    let contextualMemory: string = '';
    
    try {
      // Prevenir búsqueda si hay contradicciones
      if (hasContradictoryHistory) {
        logger.warn('⚠️ SKIPPING ALL RAG SEARCHES due to contradictory history');
        logger.warn('⚠️ This prevents confusing Claude with context that contradicts previous statements');
      } else {
        // Búsqueda en memoria conversacional
        if (searchStrategy.useConversationalRAG) {
          logger.info(`[RAG] Buscando en memoria conversacional (max: ${searchStrategy.maxResults})...`);
          const startConvSearch = Date.now();
          
          conversationalResults = await conversationalRAG.searchConversations(
            content,
            currentProjectId,
            undefined,
            searchStrategy.maxResults,
            searchStrategy.similarityThreshold
          );
          
          thresholdUsed = searchStrategy.similarityThreshold;
          const convScores = conversationalResults.map((r: any) => r.similarity || 0);
          similarityScores.push(...convScores);
          
          const convSearchTime = Date.now() - startConvSearch;
          logger.info(`[RAG] Encontradas ${conversationalResults.length} memorias conversacionales en ${convSearchTime}ms`);
        }
        
        // Búsqueda en knowledge base
        if (searchStrategy.useKnowledgeBaseRAG) {
          logger.info(`[RAG] Buscando en knowledge base (max: ${searchStrategy.maxResults})...`);
          const startKbSearch = Date.now();
          
          knowledgeResults = await knowledgeBaseRAG.searchDocuments(
            content,
            currentProjectId,
            searchStrategy.maxResults,
            searchStrategy.similarityThreshold
          );
          
          thresholdUsed = searchStrategy.similarityThreshold;
          const kbScores = knowledgeResults.map((r: any) => r.similarity || 0);
          similarityScores.push(...kbScores);
          
          const kbSearchTime = Date.now() - startKbSearch;
          logger.info(`[RAG] Encontrados ${knowledgeResults.length} chunks de documentos en ${kbSearchTime}ms`);
        }
      }
      
      // Calcular estadísticas de similitud
      avgSimilarity = similarityScores.length > 0 
        ? similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length 
        : 0;
      maxSimilarity = similarityScores.length > 0 ? Math.max(...similarityScores) : 0;
      minSimilarity = similarityScores.length > 0 ? Math.min(...similarityScores) : 0;
      
      // Combinar y construir contexto
      const allResults = [
        ...knowledgeResults.map(r => ({ ...r, source_type: 'knowledge_base' })),
        ...conversationalResults.map(r => ({ ...r, source_type: 'conversation' }))
      ];
      
      if (allResults.length > 0 && !hasContradictoryHistory) {
        logger.info(`[RAG] Total de resultados combinados: ${allResults.length}`);
        
        const fileMemories = knowledgeResults;
        const conversationMemories = conversationalResults;
        
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
      } else if (hasContradictoryHistory) {
        logger.info('[RAG] Contexto omitido debido a contradicciones en historial');
      } else {
        logger.info('[RAG] No se encontró contexto relevante');
      }
      
    } catch (ragError) {
      logger.warn('[RAG] Error en búsqueda, continuando sin contexto:', ragError);
    }

    // Construir mensajes para Claude
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // Inyección de contexto con manejo de contradicciones
    if (claudeMessages.length > 0) {
      const lastUserIndex = claudeMessages.length - 1;
      if (claudeMessages[lastUserIndex].role === 'user') {
        let baseInstruction = '';
        
        // Caso especial para conversaciones con contradicciones
        if (hasContradictoryHistory) {
          baseInstruction = `NOTA IMPORTANTE: Esta conversación tiene historial previo donde no tenías acceso completo a archivos o información. 
AHORA puedes tener acceso a archivos que han sido subidos recientemente al sistema. 
Por favor, responde la pregunta del usuario de la mejor manera posible con la información actualmente disponible.

Si la pregunta se refiere a archivos específicos y no tienes acceso a ellos en este momento, 
informa al usuario que puede obtener mejores resultados creando una NUEVA conversación 
donde tendrás acceso completo al contenido de los archivos desde el inicio.

`;
          logger.info('📝 Added contradiction resolution note to prompt');
        }
        
        // Construir instrucción base según tipo de query
        if (contextualMemory && !hasContradictoryHistory) {
          if (queryContext.type === 'knowledge') {
            baseInstruction += `${contextualMemory}\nINSTRUCCIÓN: Tienes acceso a documentos del usuario. Responde basándote específicamente en el contenido proporcionado arriba.`;
          } else if (queryContext.type === 'conversational') {
            baseInstruction += `${contextualMemory}\nINSTRUCCIÓN: El usuario pregunta sobre conversaciones previas. Usa la información del contexto conversacional proporcionado.`;
          } else if (queryContext.type === 'hybrid') {
            baseInstruction += `${contextualMemory}\nINSTRUCCIÓN: Combina información de documentos y conversaciones previas para responder de manera completa.`;
          } else {
            baseInstruction += `${contextualMemory}\nINFORMACIÓN DISPONIBLE: Usa el contexto proporcionado para responder.`;
          }
        }
        
        // Aplicar prompt personalizado si se proporciona
        let finalInstruction = baseInstruction;
        if (claudeSettings.prompt) {
          finalInstruction = `${baseInstruction}\n\n--- INSTRUCCIONES ADICIONALES ---\n${claudeSettings.prompt}`;
        }
        
        finalInstruction += `\n\nPregunta del usuario:\n${claudeMessages[lastUserIndex].content}`;
        claudeMessages[lastUserIndex].content = finalInstruction;
        
        if (hasContradictoryHistory) {
          logger.info(`[RAG] Prompt ajustado para manejar contradicción histórica`);
        } else if (contextualMemory) {
          logger.info(`[RAG] Contexto inyectado - Tipo: ${queryContext.type}, Intent: ${queryContext.intent}`);
        }
      }
    }

    // Enviar a Claude API
    const { ClaudeService } = require('./services/claude.service');
    const claudeService = new ClaudeService();
    
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

    // Guardar respuesta con metadata
    const assistantMessage = await dbService.addMessage(conversationId, 'assistant', assistantContent, { 
      model: claudeResponse.model,
      usage: claudeResponse.usage,
      context_used: (conversationalResults.length + knowledgeResults.length),
      query_type: queryContext.type,
      query_intent: queryContext.intent,
      settings_used: claudeSettings,
      contradiction_detected: hasContradictoryHistory
    });

    // Almacenamiento post-respuesta
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

    // Logging final
    logger.info(`✅ Mensaje procesado exitosamente`);
    logger.info(`   - Tipo de query: ${queryContext.type}`);
    logger.info(`   - Intent: ${queryContext.intent}`);
    logger.info(`   - Memorias conversacionales: ${conversationalResults.length}`);
    logger.info(`   - Documentos: ${knowledgeResults.length}`);
    logger.info(`   - Contexto total: ${conversationalResults.length + knowledgeResults.length} items`);
    if (hasContradictoryHistory) {
      logger.info(`   - ⚠️ Contradicción detectada: Contexto omitido`);
    }

    const ragResponseTime = Date.now() - ragStartTime;
    
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
      success: true,
      contradiction_detected: hasContradictoryHistory,
      rag_metrics: {
        response_time_ms: ragResponseTime || 0,
        threshold_used: thresholdUsed,
        similarity_scores: similarityScores.slice(0, 10),
        similarity_stats: {
          avg: avgSimilarity,
          max: maxSimilarity,
          min: minSimilarity,
          count: similarityScores.length
        },
        conversational_results: conversationalResults.length,
        knowledge_results: knowledgeResults.length
      }
    });

  } catch (error) {
    logSystemError(error, 'procesamiento de mensajes');
    res.status(500).json({ error: 'Fallo al procesar mensaje' });
  }
});

// ================================================================================================
// ENDPOINTS DE CONFIGURACION Y ESTADO
// ================================================================================================

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
      'Configuración Dinámica',
      'Métricas RAG en Tiempo Real',
      'Detección de Contradicciones Históricas'
    ]
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Claude Infinito v1.1 Backend - Conversational RAG System Activo', 
    status: 'ejecutándose'
  });
});

// ================================================================================================
// SISTEMA DE MONITOREO DE ERRORES
// ================================================================================================

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

// ================================================================================================
// ENDPOINTS DE MÉTRICAS DEL SISTEMA
// ================================================================================================

app.get('/api/system/gpu-status', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const gpuInfo = await getGPUStatus();
    res.json(gpuInfo);
  } catch (error) {
    logger.error('Error obteniendo estado de GPU:', error);
    res.json({
      usage: 0,
      memory_used: 0,
      memory_total: 0,
      temperature: 0,
      rtx5070Active: false,
      error: 'No se pudo acceder a la información de GPU'
    });
  }
});

app.get('/api/system/ollama-status', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { stdout } = await execAsync('ollama ps');
    
    const lines = stdout.split('\n').filter(line => line.trim());
    const models: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 4) {
        models.push({
          name: parts[0],
          id: parts[1],
          size: parts[2],
          processor: parts[3] || 'CPU',
          until: parts[4] || ''
        });
      }
    }
    
    res.json({
      status: 'ok',
      models_loaded: models,
      gpu_active: models.some(m => m.processor.includes('GPU')),
      total_models: models.length
    });
  } catch (error) {
    logger.error('Error obteniendo estado de Ollama:', error);
    res.json({
      status: 'error',
      models_loaded: [],
      gpu_active: false,
      error: 'No se pudo acceder a Ollama'
    });
  }
});

// ================================================================================================
// ENDPOINTS DE KNOWLEDGE BASE
// ================================================================================================

app.get('/api/projects/:projectId/documents', async (req, res) => {
  const startTime = Date.now();
  const { projectId } = req.params;

  try {
    logger.info(`📂 Solicitando documentos para proyecto: ${projectId}`);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return res.status(400).json({
        error: 'Invalid project ID format',
        message: 'Project ID must be a valid UUID'
      });
    }

    const query = `
      SELECT 
        d.id,
        d.filename,
        d.file_type,
        d.file_size,
        d.upload_date,
        d.processed,
        d.processed_at,
        d.metadata,
        (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
      FROM documents d
      WHERE d.project_id = $1
      ORDER BY d.upload_date DESC
    `;
    const result = await ragPool.query(query, [projectId]);

    const documents = result.rows.map(row => ({
      id: row.id,
      filename: row.filename,
      fileType: row.file_type,
      fileSize: row.file_size,
      uploadDate: row.upload_date,
      processed: row.processed,
      processedAt: row.processed_at,
      chunkCount: parseInt(row.chunk_count) || 0,
      metadata: row.metadata || {}
    }));

    const responseTime = Date.now() - startTime;

    logger.info(`✅ Documentos recuperados: ${documents.length} documentos en ${responseTime}ms`);

    return res.json({
      success: true,
      projectId,
      documentCount: documents.length,
      documents,
      responseTime
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Error al recuperar documentos:', error);

    return res.status(500).json({
      error: 'Failed to retrieve documents',
      message: error instanceof Error ? error.message : 'Unknown error',
      responseTime
    });
  }
});

app.delete('/api/documents/:documentId', async (req, res) => {
  const { documentId } = req.params;

  try {
    logger.info(`🗑️ Eliminando documento ID: ${documentId}`);

    const docQuery = 'SELECT filename, project_id FROM documents WHERE id = $1';
    const docResult = await ragPool.query(docQuery, [documentId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Document not found',
        message: `No document found with ID ${documentId}`
      });
    }

    const document = docResult.rows[0];

    const deleteQuery = 'DELETE FROM documents WHERE id = $1';
    await ragPool.query(deleteQuery, [documentId]);

    logger.info(`✅ Documento eliminado: ${document.filename}`);

    return res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedDocument: {
        id: documentId,
        filename: document.filename,
        projectId: document.project_id
      }
    });

  } catch (error) {
    logger.error('Error al eliminar documento:', error);

    return res.status(500).json({
      error: 'Failed to delete document',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ================================================================================================
// INICIALIZACION DEL SERVIDOR
// ================================================================================================

app.listen(port, () => {
  logger.info(`Claude Infinito Backend ejecutándose en puerto ${port}`);
  logger.info('✅ Conversational RAG System ACTIVO');
  logger.info('✅ Knowledge Base RAG ACTIVO');
  logger.info('✅ Query Router ACTIVO');
  logger.info('✅ Métricas RAG en Tiempo Real ACTIVAS');
  logger.info('✅ Detección de Contradicciones Históricas ACTIVA');
  logger.info('Integración de upload de archivos habilitada');
  logger.info('Gestión inteligente de contexto habilitada');
  logger.info('Soporte de configuración dinámica habilitado');
});

export default app;
