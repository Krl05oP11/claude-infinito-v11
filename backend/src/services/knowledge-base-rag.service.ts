// backend/src/services/knowledge-base-rag.service.ts
// Knowledge Base RAG Service - Búsqueda en documentos y archivos
// Versión 3.0 - 29/09/2025

import { Pool } from 'pg';
import axios from 'axios';

// ============================================================
// INTERFACES
// ============================================================

export interface Document {
  id?: number;
  projectId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  content: string;
  metadata?: any;
  uploadDate?: Date;
  processed?: boolean;
  processedAt?: Date;
}

export interface DocumentChunk {
  id?: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  metadata?: any;
}

export interface DocumentSummary {
  id?: number;
  documentId: number;
  summaryText: string;
  summaryEmbedding?: number[];
  summaryType: string;
}

export interface KnowledgeSearchResult {
  documentId: number;
  chunkId: number;
  filename: string;
  content: string;
  similarity: number;
  metadata?: any;
}

// ============================================================
// KNOWLEDGE BASE RAG SERVICE
// ============================================================

export class KnowledgeBaseRAGService {
  private pool: Pool;
  private ollamaHost: string;
  private ollamaPort: number;
  private embeddingModel: string;
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(
    pool: Pool,
    ollamaHost: string = '172.19.0.1',
    ollamaPort: number = 11434,
    chunkSize: number = 1000,
    chunkOverlap: number = 200
  ) {
    this.pool = pool;
    this.ollamaHost = ollamaHost;
    this.ollamaPort = ollamaPort;
    this.embeddingModel = 'bge-large';
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  // ============================================================
  // ALMACENAMIENTO DE DOCUMENTOS
  // ============================================================

  /**
   * Procesa y almacena un documento completo con chunks y embeddings
   */
  async processAndStoreDocument(
    projectId: string,
    filename: string,
    fileType: string,
    fileSize: number,
    content: string,
    metadata?: any
  ): Promise<number> {
    try {
      console.log(`[KnowledgeBaseRAG] Processing document: ${filename}`);

      // 1. Almacenar documento principal
      const documentId = await this.storeDocument(
        projectId,
        filename,
        fileType,
        fileSize,
        content,
        metadata
      );

      // 2. Dividir en chunks
      const chunks = this.chunkText(content);
      console.log(`[KnowledgeBaseRAG] Created ${chunks.length} chunks`);

      // 3. Procesar cada chunk (generar embedding y almacenar)
      for (let i = 0; i < chunks.length; i++) {
        await this.processAndStoreChunk(documentId, i, chunks[i], metadata);
        
        // Log progreso cada 10 chunks
        if ((i + 1) % 10 === 0) {
          console.log(`[KnowledgeBaseRAG] Processed ${i + 1}/${chunks.length} chunks`);
        }
      }

      // 4. Generar y almacenar summary del documento
      await this.generateDocumentSummary(documentId, content);

      // 5. Marcar documento como procesado
      await this.pool.query(
        'UPDATE documents SET processed = true, processed_at = NOW() WHERE id = $1',
        [documentId]
      );

      console.log(`[KnowledgeBaseRAG] Document ${filename} processed successfully (${chunks.length} chunks)`);

      return documentId;
    } catch (error) {
      console.error('[KnowledgeBaseRAG] Error processing document:', error);
      throw error;
    }
  }

  /**
   * Almacena documento en la base de datos
   */
  private async storeDocument(
    projectId: string,
    filename: string,
    fileType: string,
    fileSize: number,
    content: string,
    metadata?: any
  ): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO documents 
       (project_id, filename, file_type, file_size, content, metadata, processed)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING id`,
      [projectId, filename, fileType, fileSize, content, JSON.stringify(metadata || {})]
    );

    return result.rows[0].id;
  }

  /**
   * Procesa y almacena un chunk individual
   */
  private async processAndStoreChunk(
    documentId: number,
    chunkIndex: number,
    content: string,
    metadata?: any
  ): Promise<void> {
    try {
      // 1. Generar embedding del chunk
      const embedding = await this.generateEmbedding(content);

      // 2. Almacenar chunk con embedding
      await this.pool.query(
        `INSERT INTO document_chunks 
         (document_id, chunk_index, content, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          documentId,
          chunkIndex,
          content,
          JSON.stringify(embedding),
          JSON.stringify(metadata || {})
        ]
      );
    } catch (error) {
      console.error(`[KnowledgeBaseRAG] Error processing chunk ${chunkIndex}:`, error);
      throw error;
    }
  }

  /**
   * Divide texto en chunks con overlap
   */
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      // Extraer chunk
      let endIndex = startIndex + this.chunkSize;
      
      // Si no es el último chunk, buscar el último espacio para no cortar palabras
      if (endIndex < text.length) {
        const lastSpace = text.lastIndexOf(' ', endIndex);
        if (lastSpace > startIndex) {
          endIndex = lastSpace;
        }
      }

      const chunk = text.slice(startIndex, endIndex).trim();
      
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Mover índice con overlap
      startIndex = endIndex - this.chunkOverlap;
      
      // Asegurar que avanzamos al menos un poco
      if (startIndex <= chunks.length * this.chunkSize - this.chunkSize) {
        startIndex = chunks.length * this.chunkSize;
      }
    }

    return chunks;
  }

  // ============================================================
  // BÚSQUEDA EN KNOWLEDGE BASE
  // ============================================================

  /**
   * Busca en chunks de documentos usando similitud semántica
   */
  async searchDocuments(
    query: string,
    projectId: string,
    maxResults: number = 5,
    similarityThreshold: number = 0.7
  ): Promise<KnowledgeSearchResult[]> {
    try {
      console.log(`[KnowledgeBaseRAG] Searching documents for query: "${query}"`);

      // 1. Generar embedding de la query
      const queryEmbedding = await this.generateEmbedding(query);

      // 2. Buscar en chunks
      const result = await this.pool.query(
        `SELECT 
          dc.id as chunk_id,
          dc.document_id,
          d.filename,
          dc.content,
          dc.metadata,
          1 - (dc.embedding <=> $1::vector) as similarity
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.project_id = $2
          AND d.processed = true
          AND (1 - (dc.embedding <=> $1::vector)) >= $3
        ORDER BY similarity DESC
        LIMIT $4`,
        [JSON.stringify(queryEmbedding), projectId, similarityThreshold, maxResults]
      );

      console.log(`[KnowledgeBaseRAG] Found ${result.rows.length} relevant chunks`);

      return result.rows.map(row => ({
        documentId: row.document_id,
        chunkId: row.chunk_id,
        filename: row.filename,
        content: row.content,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata
      }));
    } catch (error) {
      console.error('[KnowledgeBaseRAG] Error searching documents:', error);
      throw error;
    }
  }

  /**
   * Busca en resúmenes de documentos (para búsquedas de alto nivel)
   */
  async searchDocumentSummaries(
    query: string,
    projectId: string,
    maxResults: number = 3,
    similarityThreshold: number = 0.65
  ): Promise<KnowledgeSearchResult[]> {
    try {
      console.log(`[KnowledgeBaseRAG] Searching document summaries for: "${query}"`);

      // 1. Generar embedding de la query
      const queryEmbedding = await this.generateEmbedding(query);

      // 2. Buscar en summaries
      const result = await this.pool.query(
        `SELECT 
          ds.document_id,
          d.filename,
          ds.summary_text as content,
          1 - (ds.summary_embedding <=> $1::vector) as similarity
        FROM document_summaries ds
        JOIN documents d ON ds.document_id = d.id
        WHERE d.project_id = $2
          AND d.processed = true
          AND (1 - (ds.summary_embedding <=> $1::vector)) >= $3
        ORDER BY similarity DESC
        LIMIT $4`,
        [JSON.stringify(queryEmbedding), projectId, similarityThreshold, maxResults]
      );

      console.log(`[KnowledgeBaseRAG] Found ${result.rows.length} relevant summaries`);

      return result.rows.map(row => ({
        documentId: row.document_id,
        chunkId: 0, // Summary no tiene chunk específico
        filename: row.filename,
        content: row.content,
        similarity: parseFloat(row.similarity)
      }));
    } catch (error) {
      console.error('[KnowledgeBaseRAG] Error searching summaries:', error);
      throw error;
    }
  }

  // ============================================================
  // GENERACIÓN DE EMBEDDINGS Y SUMMARIES
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
      console.error('[KnowledgeBaseRAG] Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Genera resumen de un documento completo
   */
  private async generateDocumentSummary(documentId: number, content: string): Promise<void> {
    try {
      // Tomar primeros N caracteres como resumen (o usar todo si es corto)
      const maxSummaryLength = 2000;
      const summaryText = content.length > maxSummaryLength
        ? content.slice(0, maxSummaryLength) + '...'
        : content;

      // Generar embedding del resumen
      const summaryEmbedding = await this.generateEmbedding(summaryText);

      // Almacenar resumen
      await this.pool.query(
        `INSERT INTO document_summaries 
         (document_id, summary_text, summary_embedding, summary_type)
         VALUES ($1, $2, $3, 'auto_generated')`,
        [documentId, summaryText, JSON.stringify(summaryEmbedding)]
      );

      console.log(`[KnowledgeBaseRAG] Generated summary for document ${documentId}`);
    } catch (error) {
      console.error('[KnowledgeBaseRAG] Error generating document summary:', error);
      throw error;
    }
  }

  // ============================================================
  // UTILIDADES Y MANTENIMIENTO
  // ============================================================

  /**
   * Obtiene información de un documento
   */
  async getDocumentInfo(documentId: number): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        d.*,
        COUNT(dc.id) as chunk_count,
        COUNT(ds.id) as summary_count
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      LEFT JOIN document_summaries ds ON d.id = ds.document_id
      WHERE d.id = $1
      GROUP BY d.id`,
      [documentId]
    );

    return result.rows[0] || null;
  }

  /**
   * Lista todos los documentos de un proyecto
   */
  async listProjectDocuments(projectId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        d.id,
        d.filename,
        d.file_type,
        d.file_size,
        d.upload_date,
        d.processed,
        COUNT(dc.id) as chunk_count
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.project_id = $1
      GROUP BY d.id
      ORDER BY d.upload_date DESC`,
      [projectId]
    );

    return result.rows;
  }

  /**
   * Elimina un documento y todos sus chunks
   */
  async deleteDocument(documentId: number): Promise<void> {
    await this.pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    console.log(`[KnowledgeBaseRAG] Deleted document ${documentId}`);
  }

  /**
   * Test del sistema knowledge base RAG
   */
  async testKnowledgeBaseRAG(): Promise<void> {
    console.log('\n=== TESTING KNOWLEDGE BASE RAG ===');
    
    try {
      // Test 1: Generar embedding
      const testEmbedding = await this.generateEmbedding('Test query for knowledge base RAG');
      console.log('✅ Embedding generation working:', testEmbedding.length, 'dimensions');

      // Test 2: Verificar tablas
      const tableCheck = await this.pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('documents', 'document_chunks', 'document_summaries')`
      );
      console.log('✅ Required tables exist:', tableCheck.rows.length, 'of 3');

      // Test 3: Test chunking
      const testText = 'This is a test document. '.repeat(100);
      const chunks = this.chunkText(testText);
      console.log('✅ Text chunking working:', chunks.length, 'chunks created');

      console.log('=== KNOWLEDGE BASE RAG READY ===\n');
    } catch (error) {
      console.error('❌ Knowledge Base RAG test failed:', error);
      throw error;
    }
  }
}
