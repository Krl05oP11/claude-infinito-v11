// backend/src/services/conversational-rag.service.ts
// Conversational RAG Service - Memoria entre conversaciones
// Versión 3.0 - 29/09/2025

import { Pool } from 'pg';
import axios from 'axios';

// ============================================================
// INTERFACES
// ============================================================

export interface MessagePair {
  id?: number;
  conversationThreadId: number;
  userMessageId: string;
  assistantMessageId: string;
  pairContent: string;
  pairEmbedding?: number[];
  contextMetadata?: any;
}

export interface ConversationThread {
  id?: number;
  conversationId: string;
  projectId: string;
  threadSummary?: string;
  threadEmbedding?: number[];
  messageCount: number;
  startTime: Date;
  lastMessageTime: Date;
}

export interface ConversationSummary {
  id?: number;
  conversationThreadId: number;
  summaryText: string;
  summaryEmbedding?: number[];
  summaryLevel: string;
  tokenCount: number;
}

export interface ConversationalSearchResult {
  threadId: number;
  conversationId: string;
  messagePairId?: number;
  content: string;
  similarity: number;
  timestamp: Date;
  contextMetadata?: any;
}

// ============================================================
// CONVERSATIONAL RAG SERVICE
// ============================================================

export class ConversationalRAGService {
  private pool: Pool;
  private ollamaHost: string;
  private ollamaPort: number;
  private embeddingModel: string;

  constructor(pool: Pool, ollamaHost: string = '172.19.0.1', ollamaPort: number = 11434) {
    this.pool = pool;
    this.ollamaHost = ollamaHost;
    this.ollamaPort = ollamaPort;
    this.embeddingModel = 'bge-large';
  }

  // ============================================================
  // ALMACENAMIENTO DE CONVERSACIONES
  // ============================================================

  /**
   * Almacena un par de mensajes (user-assistant) con su embedding
   */
  async storeConversationPair(
    conversationId: string,
    projectId: string,
    userMessageId: string,
    userContent: string,
    assistantMessageId: string,
    assistantContent: string
  ): Promise<void> {
    try {
      // 1. Obtener o crear conversation thread
      const threadId = await this.getOrCreateThread(conversationId, projectId);

      // 2. Crear contenido del par para embedding
      const pairContent = `Usuario: ${userContent}\n\nAsistente: ${assistantContent}`;

      // 3. Generar embedding del par
      const embedding = await this.generateEmbedding(pairContent);

      // 4. Almacenar message pair
      await this.pool.query(
        `INSERT INTO message_pairs 
         (conversation_thread_id, user_message_id, assistant_message_id, pair_content, pair_embedding, context_metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          threadId,
          userMessageId,
          assistantMessageId,
          pairContent,
          JSON.stringify(embedding),
          JSON.stringify({ stored_at: new Date() })
        ]
      );

      // 5. Actualizar thread statistics
      await this.updateThreadStatistics(threadId);

      console.log(`[ConversationalRAG] Stored message pair for conversation ${conversationId}`);
    } catch (error) {
      console.error('[ConversationalRAG] Error storing conversation pair:', error);
      throw error;
    }
  }

  /**
   * Obtiene o crea un conversation thread
   */
  private async getOrCreateThread(conversationId: string, projectId: string): Promise<number> {
    // Verificar si ya existe
    const existing = await this.pool.query(
      'SELECT id FROM conversation_threads WHERE conversation_id = $1',
      [conversationId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // Crear nuevo thread
    const result = await this.pool.query(
      `INSERT INTO conversation_threads (conversation_id, project_id, message_count)
       VALUES ($1, $2, 0)
       RETURNING id`,
      [conversationId, projectId]
    );

    return result.rows[0].id;
  }

  /**
   * Actualiza estadísticas del thread
   */
  private async updateThreadStatistics(threadId: number): Promise<void> {
    await this.pool.query(
      `UPDATE conversation_threads 
       SET message_count = message_count + 1,
           last_message_time = NOW()
       WHERE id = $1`,
      [threadId]
    );
  }

  // ============================================================
  // BÚSQUEDA CONVERSACIONAL
  // ============================================================

  /**
   * Busca en conversaciones previas usando similitud semántica
   */
  async searchConversations(
    query: string,
    projectId: string,
    conversationId?: string,
    maxResults: number = 5,
    similarityThreshold: number = 0.7
  ): Promise<ConversationalSearchResult[]> {
    try {
      console.log(`[ConversationalRAG] Searching conversations for query: "${query}"`);

      // 1. Generar embedding de la query
      const queryEmbedding = await this.generateEmbedding(query);

      // 2. Construir query SQL basado en scope
      let sqlQuery = `
        SELECT 
          mp.id as message_pair_id,
          mp.conversation_thread_id as thread_id,
          ct.conversation_id,
          mp.pair_content as content,
          mp.context_metadata,
          ct.last_message_time as timestamp,
          1 - (mp.pair_embedding <=> $1::vector) as similarity
        FROM message_pairs mp
        JOIN conversation_threads ct ON mp.conversation_thread_id = ct.id
        WHERE ct.project_id = $2
      `;

      const params: any[] = [JSON.stringify(queryEmbedding), projectId];

      // Si se especifica conversationId, buscar solo en esa conversación
      if (conversationId) {
        sqlQuery += ` AND ct.conversation_id = $3`;
        params.push(conversationId);
      }

      // Filtrar por similarity threshold y ordenar
      sqlQuery += `
        AND (1 - (mp.pair_embedding <=> $1::vector)) >= ${similarityThreshold}
        ORDER BY similarity DESC
        LIMIT ${maxResults}
      `;

      // 3. Ejecutar búsqueda
      const result = await this.pool.query(sqlQuery, params);

      console.log(`[ConversationalRAG] Found ${result.rows.length} relevant conversation pairs`);

      // 4. Formatear resultados
      return result.rows.map(row => ({
        threadId: row.thread_id,
        conversationId: row.conversation_id,
        messagePairId: row.message_pair_id,
        content: row.content,
        similarity: parseFloat(row.similarity),
        timestamp: new Date(row.timestamp),
        contextMetadata: row.context_metadata
      }));
    } catch (error) {
      console.error('[ConversationalRAG] Error searching conversations:', error);
      throw error;
    }
  }

  /**
   * Busca en resúmenes de conversaciones (para búsquedas más amplias)
   */
  async searchConversationSummaries(
    query: string,
    projectId: string,
    maxResults: number = 3,
    similarityThreshold: number = 0.65
  ): Promise<ConversationalSearchResult[]> {
    try {
      console.log(`[ConversationalRAG] Searching conversation summaries for: "${query}"`);

      // 1. Generar embedding de la query
      const queryEmbedding = await this.generateEmbedding(query);

      // 2. Buscar en summaries
      const result = await this.pool.query(
        `SELECT 
          cs.conversation_thread_id as thread_id,
          ct.conversation_id,
          cs.summary_text as content,
          ct.last_message_time as timestamp,
          1 - (cs.summary_embedding <=> $1::vector) as similarity
        FROM conversation_summaries cs
        JOIN conversation_threads ct ON cs.conversation_thread_id = ct.id
        WHERE ct.project_id = $2
          AND (1 - (cs.summary_embedding <=> $1::vector)) >= $3
        ORDER BY similarity DESC
        LIMIT $4`,
        [JSON.stringify(queryEmbedding), projectId, similarityThreshold, maxResults]
      );

      console.log(`[ConversationalRAG] Found ${result.rows.length} relevant summaries`);

      return result.rows.map(row => ({
        threadId: row.thread_id,
        conversationId: row.conversation_id,
        content: row.content,
        similarity: parseFloat(row.similarity),
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      console.error('[ConversationalRAG] Error searching summaries:', error);
      throw error;
    }
  }

  // ============================================================
  // GENERACIÓN DE EMBEDDINGS
  // ============================================================

  /**
   * Genera embedding usando Ollama + bge-large
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        `http://${this.ollamaHost}:${this.ollamaPort}/api/embeddings`,
        {
          model: this.embeddingModel,
          prompt: text
        },
        {
          timeout: 30000 // 30 segundos timeout
        }
      );

      if (!response.data || !response.data.embedding) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return response.data.embedding;
    } catch (error) {
      console.error('[ConversationalRAG] Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ============================================================
  // MANTENIMIENTO Y UTILIDADES
  // ============================================================

  /**
   * Genera resumen de un thread completo
   */
  async generateThreadSummary(threadId: number): Promise<void> {
    try {
      // 1. Obtener todos los message pairs del thread
      const pairs = await this.pool.query(
        `SELECT pair_content 
         FROM message_pairs 
         WHERE conversation_thread_id = $1 
         ORDER BY created_at ASC`,
        [threadId]
      );

      if (pairs.rows.length === 0) {
        return;
      }

      // 2. Concatenar contenido (limitado a últimos N mensajes para no sobrepasar límites)
      const recentPairs = pairs.rows.slice(-10); // Últimos 10 pares
      const summaryText = recentPairs
        .map((row, idx) => `[${idx + 1}] ${row.pair_content}`)
        .join('\n\n');

      // 3. Generar embedding del resumen
      const summaryEmbedding = await this.generateEmbedding(summaryText);

      // 4. Almacenar resumen
      await this.pool.query(
        `INSERT INTO conversation_summaries 
         (conversation_thread_id, summary_text, summary_embedding, summary_level, token_count)
         VALUES ($1, $2, $3, 'thread', $4)
         ON CONFLICT (conversation_thread_id) 
         DO UPDATE SET 
           summary_text = EXCLUDED.summary_text,
           summary_embedding = EXCLUDED.summary_embedding,
           token_count = EXCLUDED.token_count`,
        [
          threadId,
          summaryText,
          JSON.stringify(summaryEmbedding),
          summaryText.length
        ]
      );

      console.log(`[ConversationalRAG] Generated summary for thread ${threadId}`);
    } catch (error) {
      console.error('[ConversationalRAG] Error generating thread summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de un conversation thread
   */
  async getThreadStatistics(conversationId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        ct.id,
        ct.message_count,
        ct.start_time,
        ct.last_message_time,
        COUNT(DISTINCT mp.id) as stored_pairs,
        COUNT(DISTINCT cs.id) as summaries_count
      FROM conversation_threads ct
      LEFT JOIN message_pairs mp ON ct.id = mp.conversation_thread_id
      LEFT JOIN conversation_summaries cs ON ct.id = cs.conversation_thread_id
      WHERE ct.conversation_id = $1
      GROUP BY ct.id`,
      [conversationId]
    );

    return result.rows[0] || null;
  }

  /**
   * Test del sistema conversational RAG
   */
  async testConversationalRAG(): Promise<void> {
    console.log('\n=== TESTING CONVERSATIONAL RAG ===');
    
    try {
      // Test 1: Generar embedding
      const testEmbedding = await this.generateEmbedding('Test query for conversational RAG');
      console.log('✅ Embedding generation working:', testEmbedding.length, 'dimensions');

      // Test 2: Verificar tablas
      const tableCheck = await this.pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('conversation_threads', 'message_pairs', 'conversation_summaries')`
      );
      console.log('✅ Required tables exist:', tableCheck.rows.length, 'of 3');

      console.log('=== CONVERSATIONAL RAG READY ===\n');
    } catch (error) {
      console.error('❌ Conversational RAG test failed:', error);
      throw error;
    }
  }
}
