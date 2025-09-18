import axios from 'axios';
import { EmbeddingService } from './embedding.service';
import crypto from 'crypto';

interface ChromaDBCollection {
  id: string;
  name: string;
  metadata?: any;
}

interface MemorySearchResult {
  ids: string[][];
  distances: number[][];
  documents: string[][];
  metadatas: any[][];
}

interface Memory {
  id: string;
  content: string;
  metadata: {
    conversation_id: string;
    project_id: string;
    timestamp: string;
    role?: string;
    conversation_title?: string;
    model?: string;
    similarity?: number;
    user_message?: string;
    assistant_response?: string;
    [key: string]: any;
  };
}

export class RAGService {
  private chromaDbUrl: string;
  private embeddingService: EmbeddingService;
  private similarityThreshold: number = 0.3;

  constructor() {
    this.chromaDbUrl = process.env.CHROMA_DB_URL || 'http://localhost:8001';
    this.embeddingService = new EmbeddingService();
    console.log(`ChromaDB config: ${this.chromaDbUrl} (API v2)`);
  }

  private getHeaders(): any {
    return {
      'Content-Type': 'application/json'
    };
  }

  private getApiUrl(endpoint: string): string {
    return `${this.chromaDbUrl}/api/v2/tenants/default_tenant/databases/default_database${endpoint}`;
  }

  // Obtener todas las colecciones
  async getAllCollections(): Promise<ChromaDBCollection[]> {
    try {
      const response = await axios.get(
        this.getApiUrl('/collections'),
        { headers: this.getHeaders() }
      );
      return response.data || [];
    } catch (error: any) {
      console.error('Error getting collections:', error.response?.data || error.message);
      return [];
    }
  }

  // Obtener collection ID por project ID
  async getProjectCollectionId(projectId: string): Promise<string | null> {
    const collectionName = `project_cosine_${projectId}`;
    try {
      const collections = await this.getAllCollections();
      const existing = collections.find((c: ChromaDBCollection) => c.name === collectionName);
      if (existing) {
        console.log(`✅ Found COSINE collection ID: ${existing.id} for project: ${projectId}`);
        return existing.id;
      }
      console.log(`❌ No COSINE collection found for project: ${projectId}`);
      return null;
    } catch (error: any) {
      console.error('Error finding collection ID:', error.response?.data || error.message);
      return null;
    }
  }
  
  async getProjectCollections(): Promise<ChromaDBCollection[]> {
    const allCollections = await this.getAllCollections();
    
    // ⭐ SOLO colecciones coseno - ignorar las L2 viejas
    const cosineCollections = allCollections.filter(col => 
      col.name.startsWith('project_cosine_')
    );
    
    console.log(`🔍 Found ${allCollections.length} total collections, ${cosineCollections.length} COSINE collections`);
    cosineCollections.forEach(col => {
      console.log(`✅ COSINE Collection: ${col.name} (ID: ${col.id})`);
    });
    
    // Si no hay colecciones coseno, devolver array vacío (no las L2 viejas)
    if (cosineCollections.length === 0) {
      console.log(`⚠️ No COSINE collections found - searches will return empty until new cosine collection is created`);
    }
    
    return cosineCollections;
  }

  async createProjectCollection(projectId: string): Promise<string | null> {
    const collectionName = `project_cosine_${projectId}`;
    
    console.log(`🔧 FORCE Creating NEW COSINE collection: ${collectionName}`);
    
    try {
      const requestBody = {
        name: collectionName,
        metadata: {
          project_id: projectId,
          created_at: new Date().toISOString(),
          description: 'RAG memory collection for Claude Infinito - COSINE SIMILARITY',
          similarity_type: 'cosine'
        },
        configuration: {
          hnsw: {
            space: "cosine",
            ef_construction: 100,
            ef_search: 100,
            max_neighbors: 16,
            resize_factor: 1.2,
            sync_threshold: 1000
          }
        }
      };
      
      console.log(`🔧 FORCE Creating collection with cosine space: ${collectionName}`);
      
      const response = await axios.post(
        this.getApiUrl('/collections'),
        requestBody,
        { headers: this.getHeaders() }
      );
      
      console.log(`✅ FORCE Created NEW COSINE collection: ${collectionName} ID: ${response.data.id}`);
      console.log(`🔧 Collection configuration:`, response.data.configuration_json);
      
      return response.data.id;
    } catch (error: any) {
      console.error(`❌ ERROR creating FORCE cosine collection:`, error.response?.data);
      return null;
    }
  }

  // 🛠️ MODIFICACIÓN 1: Aumentar límite por defecto y hacer threshold flexible
  async searchInCollection(collectionId: string, query: string, limit: number = 15, customThreshold?: number): Promise<Memory[]> {
    try {
      // 🛠️ MODIFICACIÓN 2: Usar threshold personalizado si se proporciona
      const threshold = customThreshold || this.similarityThreshold;
      
      console.log(`🔍 SEARCH DEBUG: Starting search in COSINE collection ${collectionId}`);
      console.log(`🔍 SEARCH DEBUG: Query: "${query.substring(0, 50)}..."`);
      console.log(`🔍 SEARCH DEBUG: Limit: ${limit}, Threshold: ${threshold}`);
      
      const embedding = await this.embeddingService.generateEmbedding(query);
      console.log(`🔍 SEARCH DEBUG: Embedding generated, length: ${embedding.length}`);
      
      const requestBody = {
        query_embeddings: [embedding],
        n_results: limit,
        include: ['documents', 'metadatas', 'distances']
      };
      
      const url = this.getApiUrl(`/collections/${collectionId}/query`);
      const response = await axios.post(url, requestBody, { headers: this.getHeaders() });
      
      console.log(`🔍 SEARCH DEBUG: Response status: ${response.status}`);
      
      const results: MemorySearchResult = response.data;
      
      if (!results.ids || !results.ids[0] || results.ids[0].length === 0) {
        console.log(`❌ SEARCH DEBUG: No memories returned from ChromaDB`);
        return [];
      }

      console.log(`📊 SEARCH DEBUG: ChromaDB returned ${results.ids[0].length} total memories`);
      
      const memories: Memory[] = [];
      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances[0][i];
        const similarity = 1 - distance;
        const content = results.documents[0][i];
        const rawMetadata = results.metadatas[0][i];
        
        console.log(`\n--- MEMORY ${i + 1} (COSINE) ---`);
        console.log(`Distance: ${distance.toFixed(4)}`);
        console.log(`Similarity: ${similarity.toFixed(4)}`);
        console.log(`Threshold: ${threshold}`);
        console.log(`Content preview: "${content.substring(0, 100)}..."`);
        console.log(`🔍 RAW METADATA DEBUG:`, JSON.stringify(rawMetadata, null, 2));
        
        const processedMetadata = {
          conversation_id: rawMetadata?.conversation_id || 'unknown',
          project_id: rawMetadata?.project_id || 'unknown',
          timestamp: rawMetadata?.timestamp || new Date().toISOString(),
          source_type: rawMetadata?.source_type,
          file_name: rawMetadata?.file_name || rawMetadata?.filename,
          filename: rawMetadata?.filename || rawMetadata?.file_name,
          fileType: rawMetadata?.fileType,
          ...rawMetadata,
          similarity: similarity
        };
        
        console.log(`🔍 PROCESSED METADATA:`, JSON.stringify({
          source_type: processedMetadata.source_type,
          file_name: processedMetadata.file_name,
          filename: processedMetadata.filename,
          fileType: processedMetadata.fileType
        }, null, 2));
        
        if (similarity >= threshold) {
          console.log(`✅ MEMORY ${i + 1}: ABOVE threshold, adding to results`);
          
          memories.push({
            id: results.ids[0][i],
            content: content,
            metadata: processedMetadata
          });
        } else {
          console.log(`❌ MEMORY ${i + 1}: BELOW threshold (${similarity.toFixed(4)} < ${threshold})`);
        }
      }
      
      console.log(`\n🎯 SEARCH DEBUG: Final results: ${memories.length} memories above threshold`);
      
      const fileMemoriesFound = memories.filter(m => 
        m.metadata?.source_type === 'file_upload' || 
        m.metadata?.file_name || 
        m.metadata?.filename || 
        m.metadata?.fileType
      );
      const conversationMemoriesFound = memories.filter(m => 
        !(m.metadata?.source_type === 'file_upload' || 
          m.metadata?.file_name || 
          m.metadata?.filename || 
          m.metadata?.fileType)
      );
      
      console.log(`🔍 DETECTION RESULTS: ${fileMemoriesFound.length} files, ${conversationMemoriesFound.length} conversations`);
      
      if (fileMemoriesFound.length > 0) {
        console.log(`📄 FILES DETECTED:`);
        fileMemoriesFound.forEach((mem, idx) => {
          console.log(`📄 File ${idx + 1}: ${mem.metadata?.file_name || mem.metadata?.filename} (type: ${mem.metadata?.source_type})`);
        });
      }
      
      return memories;
    } catch (error: any) {
      console.error(`❌ SEARCH ERROR: Failed to search collection ${collectionId}`);
      console.error(`❌ SEARCH ERROR: Status: ${error.response?.status}`);
      console.error(`❌ SEARCH ERROR: Data:`, error.response?.data);
      return [];
    }
  }

  // 🛠️ MODIFICACIÓN 3: Optimizado para archivos grandes con más resultados y threshold flexible
  async searchAllProjects(query: string, limit: number = 50, userThreshold?: number): Promise<Memory[]> {
    try {
      console.log(`🔍 Searching GLOBAL knowledge base + ALL projects for: "${query.substring(0, 50)}..."`);
    
      const allMemories: Memory[] = [];
      
      // 🛠️ MODIFICACIÓN 4: Detectar si es búsqueda de páginas específicas o índices
      const isPageQuery = query.toLowerCase().includes('página') || 
                         query.toLowerCase().includes('page') ||
                         query.toLowerCase().includes('table of contents') ||
                         query.toLowerCase().includes('índice') ||
                         query.toLowerCase().includes('toc') ||
                         /test\s*\d+/i.test(query); // Detecta "Test 19", "test 7", etc.
      
      // 🛠️ MODIFICACIÓN 5: Usar parámetros más agresivos para búsquedas específicas
      const searchLimit = isPageQuery ? 80 : 50; // Más resultados para páginas específicas
      
      // ✅ PRESERVAR configuración del usuario - solo sugerir threshold más permisivo si no hay config personalizada
      let effectiveThreshold: number;
      if (userThreshold !== undefined) {
        // Usuario ha configurado threshold específico desde UI - RESPETARLO
        effectiveThreshold = userThreshold;
        console.log(`🎯 USING USER-CONFIGURED threshold: ${effectiveThreshold} (UI setting preserved)`);
      } else {
        // No hay configuración del usuario, usar automático
        effectiveThreshold = isPageQuery ? 0.15 : this.similarityThreshold;
        if (isPageQuery) {
          console.log(`🎯 DETECTED PAGE/INDEX QUERY - Using enhanced search: limit=${searchLimit}, threshold=${effectiveThreshold} (auto-detected)`);
        }
      }
      
      // 🎯 PASO 1: Buscar en GLOBAL KNOWLEDGE BASE primero con parámetros optimizados
      console.log(`🌍 Searching GLOBAL knowledge base...`);
      const globalCollectionId = await this.getProjectCollectionId("global_knowledge_base");
      
      if (globalCollectionId) {
        console.log(`🌍 Found global collection ID: ${globalCollectionId}`);
        // 🛠️ MODIFICACIÓN 6: Usar límite y threshold optimizados para global KB
        const globalMemories = await this.searchInCollection(globalCollectionId, query, searchLimit, effectiveThreshold);
        console.log(`🌍 Global knowledge base: found ${globalMemories.length} memories`);
        allMemories.push(...globalMemories);
      } else {
        console.log(`⚠️ Global knowledge base not found (no files uploaded yet)`);
      }
      
      // 🎯 PASO 2: Buscar en colecciones de proyectos específicos
      const projectCollections = await this.getProjectCollections();
      console.log(`📁 Found ${projectCollections.length} project collections`);
    
      for (const collection of projectCollections) {
        // Skip global knowledge base si ya lo buscamos
        if (collection.name === "project_cosine_global_knowledge_base") {
          continue;
        }
        
        console.log(`🔍 Searching project collection ${collection.id} (${collection.name})`);
        const memories = await this.searchInCollection(collection.id, query, searchLimit, effectiveThreshold);
        console.log(`🔍 Project ${collection.name}: found ${memories.length} memories`);
        allMemories.push(...memories);
      }
    
      // Ordenar por similitud y limitar resultados finales
      const sortedMemories = allMemories
        .sort((a, b) => (b.metadata.similarity || 0) - (a.metadata.similarity || 0))
        .slice(0, limit);
    
      const relevantMemories = sortedMemories.filter(m => (m.metadata.similarity || 0) >= effectiveThreshold);
    
      console.log(`🎯 GLOBAL + PROJECT search results: ${allMemories.length} total, ${relevantMemories.length} above threshold (${effectiveThreshold})`);
      console.log(`🌍 Global files accessible from ANY conversation!`);
    
      return relevantMemories;
    } catch (error: any) {
      console.error('❌ Error searching GLOBAL + projects:', error.response?.data || error.message);
      return [];
    }
  }

  // Inyectar contexto relevante en prompt
  injectContextIntoPrompt(originalPrompt: string, memories: Memory[]): string {
    if (memories.length === 0) {
      return originalPrompt;
    }

    const contextSection = memories
      .map(memory => `[Memory: ${memory.content.substring(0, 150)}...]`)
      .join('\n');
    
    const totalContextLength = contextSection.length;
    console.log(`Injecting ${totalContextLength} characters of context`);

    return `Context from previous conversations:
${contextSection}

Current question: ${originalPrompt}`;
  }

  // Método principal para buscar contexto
  async searchRelevantContext(query: string, projectId?: string, limit: number = 5): Promise<Memory[]> {
    if (projectId) {
      const collectionId = await this.getProjectCollectionId(projectId);
      if (collectionId) {
        return await this.searchInCollection(collectionId, query, limit);
      }
      return [];
    } else {
      return await this.searchAllProjects(query, limit);
    }
  }

  async addMemory(
    projectId: string, 
    conversationId: string, 
    content: string, 
    metadata: any
  ): Promise<boolean> {
    try {
      // Obtener o crear colección y obtener su ID
      let collectionId = await this.getProjectCollectionId(projectId);
      if (!collectionId) {
        console.log(`Creating new COSINE collection for project: ${projectId}`);
        collectionId = await this.createProjectCollection(projectId);
      }
      
      if (!collectionId) {
        console.error('❌ Could not get collection ID');
        return false;
      }
      
      // Crear objeto Memory
      const memory: Memory = {
        id: crypto.randomUUID(),
        content: content,
        metadata: {
          conversation_id: conversationId,
          project_id: projectId,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      };
      
      // Generar embedding del contenido
      const embedding = await this.embeddingService.generateEmbedding(memory.content);
      
      const response = await axios.post(
        this.getApiUrl(`/collections/${collectionId}/add`),
        {
          ids: [memory.id],
          embeddings: [embedding],
          documents: [memory.content],
          metadatas: [memory.metadata]
        },
        { headers: this.getHeaders() }
      );
      
      console.log(`✅ Added memory to ChromaDB collection ID: ${collectionId}`);
      return true;
    } catch (error: any) {
      console.error('❌ Error adding memory:', error.response?.data || error.message);
      return false;
    }
  }

  // Health check para compatibilidad con index.ts
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.chromaDbUrl}/api/v2/heartbeat`,
        { headers: this.getHeaders() }
      );
      return response.status === 200;
    } catch (error) {
      console.error('ChromaDB health check failed:', error);
      return false;
    }
  }
}

