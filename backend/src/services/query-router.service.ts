// backend/src/services/query-router.service.ts
// Query Router para Conversational RAG + Knowledge Base
// Versión 3.0 - 29/09/2025

import { Pool } from 'pg';

// ============================================================
// INTERFACES Y TIPOS
// ============================================================

export type QueryType = 'conversational' | 'knowledge' | 'hybrid';
export type QueryIntent = 
  | 'recall_conversation'      // Buscar en conversaciones pasadas
  | 'search_documents'          // Buscar en documentos/archivos
  | 'contextual_blend'          // Combinar ambas fuentes
  | 'general_question';         // Pregunta general sin contexto específico

export type SearchScope = 
  | 'current_conversation'      // Solo conversación actual
  | 'current_project'           // Todas las conversaciones del proyecto
  | 'cross_project'             // A través de múltiples proyectos
  | 'global';                   // Búsqueda global en todo

export interface QueryContext {
  type: QueryType;
  intent: QueryIntent;
  scope: SearchScope;
  confidence: number;           // 0-1, qué tan seguro está de la clasificación
  keywords: string[];           // Palabras clave extraídas
  temporalContext?: {           // Si la query tiene contexto temporal
    relative: boolean;          // "ayer", "la semana pasada"
    specific?: Date;            // Fecha específica si se menciona
  };
}

export interface SearchStrategy {
  useConversationalRAG: boolean;
  useKnowledgeBaseRAG: boolean;
  conversationalWeight: number;  // 0-1, peso de resultados conversacionales
  knowledgeWeight: number;       // 0-1, peso de resultados de documentos
  maxResults: number;
  similarityThreshold: number;   // Threshold mínimo de similitud
}

export interface SearchResults {
  conversationalResults?: ConversationalResult[];
  knowledgeResults?: KnowledgeResult[];
  blendedContext: string;        // Contexto combinado y formateado
  sources: SearchSource[];       // Fuentes utilizadas
}

export interface ConversationalResult {
  threadId: number;
  conversationId: string;
  messagePairId?: number;
  content: string;
  similarity: number;
  timestamp: Date;
  contextMetadata?: any;
}

export interface KnowledgeResult {
  documentId: number;
  chunkId: number;
  filename: string;
  content: string;
  similarity: number;
  metadata?: any;
}

export interface SearchSource {
  type: 'conversation' | 'document';
  id: string | number;
  title: string;
  relevance: number;
}

// ============================================================
// QUERY ROUTER SERVICE
// ============================================================

export class QueryRouterService {
  private pool: Pool;
  private conversationalKeywords = [
    'dijimos', 'hablamos', 'discutimos', 'mencionaste', 'mencioné',
    'conversamos', 'charlamos', 'platicamos', 'comentaste', 'comenté',
    'acordamos', 'decidimos', 'concluimos',
    'said', 'talked', 'discussed', 'mentioned', 'conversation',
    'ayer', 'antes', 'anteriormente', 'previamente', 'la vez pasada',
    'yesterday', 'before', 'previously', 'last time', 'earlier'
  ];

  private knowledgeKeywords = [
    'archivo', 'documento', 'pdf', 'texto', 'dice', 'contiene',
    'según', 'basándote', 'lee', 'revisa', 'consulta',
    'file', 'document', 'paper', 'text', 'says', 'contains',
    'according', 'based on', 'read', 'check', 'review'
  ];

  private hybridKeywords = [
    'continúa', 'profundiza', 'amplía', 'elabora', 'explica más',
    'basándote en', 'tomando en cuenta', 'considerando',
    'continue', 'expand', 'elaborate', 'explain more',
    'based on', 'taking into account', 'considering'
  ];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ============================================================
  // ANÁLISIS Y CLASIFICACIÓN DE QUERY
  // ============================================================

  /**
   * Analiza una query y determina su contexto
   */
  public async analyzeQuery(
    query: string,
    conversationId: string,
    projectId: string,
    conversationHistory?: any[]
  ): Promise<QueryContext> {
    const normalizedQuery = query.toLowerCase();
    
    // Extraer keywords
    const keywords = this.extractKeywords(query);
    
    // Detectar tipo de query
    const type = this.detectQueryType(normalizedQuery);
    
    // Determinar intent
    const intent = this.determineIntent(normalizedQuery, type, conversationHistory);
    
    // Determinar scope
    const scope = this.determineScope(normalizedQuery, intent);
    
    // Detectar contexto temporal
    const temporalContext = this.detectTemporalContext(normalizedQuery);
    
    // Calcular confidence
    const confidence = this.calculateConfidence(type, intent, keywords);

    return {
      type,
      intent,
      scope,
      confidence,
      keywords,
      temporalContext
    };
  }

  /**
   * Detecta el tipo principal de query
   */
  private detectQueryType(query: string): QueryType {
    const conversationalScore = this.conversationalKeywords.filter(
      kw => query.includes(kw)
    ).length;

    const knowledgeScore = this.knowledgeKeywords.filter(
      kw => query.includes(kw)
    ).length;

    const hybridScore = this.hybridKeywords.filter(
      kw => query.includes(kw)
    ).length;

    // Si tiene keywords híbridas, es híbrida
    if (hybridScore > 0) {
      return 'hybrid';
    }

    // Si tiene ambos tipos, es híbrida
    if (conversationalScore > 0 && knowledgeScore > 0) {
      return 'hybrid';
    }

    // Si solo tiene conversacionales
    if (conversationalScore > knowledgeScore) {
      return 'conversational';
    }

    // Si solo tiene knowledge
    if (knowledgeScore > conversationalScore) {
      return 'knowledge';
    }

    // Por defecto, asumir knowledge (buscar en documentos)
    return 'knowledge';
  }

  /**
   * Determina la intención específica de la query
   */
  private determineIntent(
    query: string,
    type: QueryType,
    conversationHistory?: any[]
  ): QueryIntent {
    // Si es conversacional, buscar en conversaciones
    if (type === 'conversational') {
      return 'recall_conversation';
    }

    // Si es knowledge pura, buscar en documentos
    if (type === 'knowledge') {
      return 'search_documents';
    }

    // Si es híbrida, necesita blend
    if (type === 'hybrid') {
      return 'contextual_blend';
    }

    return 'general_question';
  }

  /**
   * Determina el scope de búsqueda
   */
  private determineScope(query: string, intent: QueryIntent): SearchScope {
    // Si menciona "esta conversación" o similar
    if (query.includes('esta conversación') || query.includes('this conversation')) {
      return 'current_conversation';
    }

    // Si menciona "todos los proyectos" o "global"
    if (query.includes('todos los proyectos') || query.includes('global')) {
      return 'global';
    }

    // Default: proyecto actual
    return 'current_project';
  }

  /**
   * Detecta contexto temporal en la query
   */
  private detectTemporalContext(query: string): QueryContext['temporalContext'] | undefined {
    const temporalKeywords = [
      'ayer', 'yesterday', 'antes', 'before', 'previamente', 'previously',
      'la semana pasada', 'last week', 'el mes pasado', 'last month'
    ];

    const hasTemporalContext = temporalKeywords.some(kw => query.includes(kw));

    if (hasTemporalContext) {
      return {
        relative: true
      };
    }

    return undefined;
  }

  /**
   * Extrae keywords significativas de la query
   */
  private extractKeywords(query: string): string[] {
    // Palabras a ignorar (stop words)
    const stopWords = new Set([
      'el', 'la', 'de', 'que', 'en', 'un', 'una', 'los', 'las',
      'por', 'con', 'para', 'su', 'al', 'del', 'es', 'y', 'a',
      'the', 'is', 'at', 'which', 'on', 'in', 'a', 'an', 'and', 'or'
    ]);

    const words = query.toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Retornar palabras únicas
    return [...new Set(words)];
  }

  /**
   * Calcula confidence score basado en señales detectadas
   */
  private calculateConfidence(
    type: QueryType,
    intent: QueryIntent,
    keywords: string[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Aumentar si hay keywords específicas
    if (keywords.length > 2) {
      confidence += 0.2;
    }

    // Aumentar si el tipo es muy claro
    if (type !== 'hybrid') {
      confidence += 0.2;
    }

    // Aumentar si el intent es específico
    if (intent !== 'general_question') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  // ============================================================
  // DETERMINACIÓN DE ESTRATEGIA DE BÚSQUEDA
  // ============================================================

  /**
   * Determina la estrategia de búsqueda basada en el contexto
   */
  public determineSearchStrategy(context: QueryContext): SearchStrategy {
    const strategy: SearchStrategy = {
      useConversationalRAG: false,
      useKnowledgeBaseRAG: false,
      conversationalWeight: 0.5,
      knowledgeWeight: 0.5,
      maxResults: 5,
      similarityThreshold: 0.7
    };

    switch (context.type) {
      case 'conversational':
        strategy.useConversationalRAG = true;
        strategy.useKnowledgeBaseRAG = false;
        strategy.conversationalWeight = 1.0;
        strategy.knowledgeWeight = 0.0;
        strategy.maxResults = 3;
        break;

      case 'knowledge':
        strategy.useConversationalRAG = false;
        strategy.useKnowledgeBaseRAG = true;
        strategy.conversationalWeight = 0.0;
        strategy.knowledgeWeight = 1.0;
        strategy.maxResults = 5;
        break;

      case 'hybrid':
        strategy.useConversationalRAG = true;
        strategy.useKnowledgeBaseRAG = true;
        strategy.conversationalWeight = 0.4;
        strategy.knowledgeWeight = 0.6;
        strategy.maxResults = 8;
        break;
    }

    // Ajustar threshold basado en confidence
    if (context.confidence < 0.6) {
      strategy.similarityThreshold = 0.65; // Más permisivo si no estamos seguros
    }

    return strategy;
  }

  // ============================================================
  // ROUTING Y EJECUCIÓN DE BÚSQUEDA
  // ============================================================

  /**
   * Ejecuta la búsqueda según el contexto y estrategia
   * Esta función será llamada por los servicios RAG específicos
   */
  public async routeQuery(
    query: string,
    context: QueryContext,
    strategy: SearchStrategy,
    conversationId: string,
    projectId: string
  ): Promise<SearchResults> {
    const results: SearchResults = {
      blendedContext: '',
      sources: []
    };

    // Ejecutar búsquedas según estrategia
    // Nota: Estas llamadas serán implementadas en FASE 3
    if (strategy.useConversationalRAG) {
      console.log('[QueryRouter] Ejecutando Conversational RAG search...');
      // results.conversationalResults = await this.searchConversationalRAG(...)
    }

    if (strategy.useKnowledgeBaseRAG) {
      console.log('[QueryRouter] Ejecutando Knowledge Base RAG search...');
      // results.knowledgeResults = await this.searchKnowledgeBaseRAG(...)
    }

    // Blend results (por ahora placeholder)
    results.blendedContext = this.blendResults(results, strategy);

    return results;
  }

  /**
   * Combina resultados de ambas fuentes
   */
  private blendResults(results: SearchResults, strategy: SearchStrategy): string {
    let context = '';

    if (results.conversationalResults && results.conversationalResults.length > 0) {
      context += '=== Contexto de Conversaciones Previas ===\n';
      results.conversationalResults.forEach((result, idx) => {
        context += `[${idx + 1}] ${result.content}\n`;
      });
      context += '\n';
    }

    if (results.knowledgeResults && results.knowledgeResults.length > 0) {
      context += '=== Contexto de Documentos ===\n';
      results.knowledgeResults.forEach((result, idx) => {
        context += `[${idx + 1}] (${result.filename}) ${result.content}\n`;
      });
    }

    return context || 'No se encontró contexto relevante.';
  }

  // ============================================================
  // MÉTODOS DE UTILIDAD
  // ============================================================

  /**
   * Log del análisis de query para debugging
   */
  public logQueryAnalysis(query: string, context: QueryContext, strategy: SearchStrategy): void {
    console.log('\n=== QUERY ROUTER ANALYSIS ===');
    console.log('Query:', query);
    console.log('Type:', context.type);
    console.log('Intent:', context.intent);
    console.log('Scope:', context.scope);
    console.log('Confidence:', context.confidence.toFixed(2));
    console.log('Keywords:', context.keywords.join(', '));
    console.log('\nStrategy:');
    console.log('- Use Conversational RAG:', strategy.useConversationalRAG);
    console.log('- Use Knowledge Base RAG:', strategy.useKnowledgeBaseRAG);
    console.log('- Conversational Weight:', strategy.conversationalWeight);
    console.log('- Knowledge Weight:', strategy.knowledgeWeight);
    console.log('- Max Results:', strategy.maxResults);
    console.log('- Similarity Threshold:', strategy.similarityThreshold);
    console.log('============================\n');
  }
}
