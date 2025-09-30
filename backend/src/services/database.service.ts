import { Client } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Interfaz para datos de conversación
 */
export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  project_name?: string;
}

/**
 * Interfaz para mensajes de conversación
 */
export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: string;
}

/**
 * Interfaz para resultados de búsqueda de conversaciones
 */
export interface ConversationSearchResult extends Conversation {
  highlighted_title?: string;
}

/**
 * Configuración de conexión a base de datos
 */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Servicio de base de datos PostgreSQL para Claude Infinito
 * Maneja conversaciones, mensajes, proyectos y búsquedas con texto completo
 */
export class DatabaseService {
  private client: Client;
  private readonly config: DatabaseConfig;

  // ============================================================================
  // SECCIÓN 1: CONFIGURACIÓN E INICIALIZACIÓN
  // ============================================================================

  constructor() {
    this.config = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5433'),
      database: process.env.POSTGRES_DB || 'claude_infinito',
      user: process.env.POSTGRES_USER || 'claude_user',
      password: process.env.POSTGRES_PASSWORD || 'claude_password'
    };

    this.client = new Client(this.config);
  }

  /**
   * Establece conexión con la base de datos PostgreSQL
   * @throws Error si la conexión falla
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Conexión a base de datos establecida exitosamente');
    } catch (error) {
      logger.error('Error de conexión a base de datos:', error);
      throw error;
    }
  }

  /**
   * Verifica si la conexión a la base de datos está activa
   * @returns true si la conexión está establecida
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.client.query('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  // ============================================================================
  // SECCIÓN 2: GESTIÓN DE CONVERSACIONES
  // ============================================================================

  /**
   * Crea una nueva conversación asociada a un proyecto
   * @param title - Título de la conversación
   * @param projectId - ID del proyecto (por defecto 'default')
   * @returns Conversación creada con datos completos
   */
  async createConversation(title: string, projectId = 'default'): Promise<Conversation> {
    try {
      // Buscar proyecto existente o usar el ID proporcionado
      const projectResult = await this.client.query(
        'SELECT id FROM projects WHERE name = $1', 
        ['default']
      );
      
      const actualProjectId = projectResult.rows[0]?.id || projectId;
      
      const result = await this.client.query(`
        INSERT INTO conversations (project_id, title) 
        VALUES ($1, $2) 
        RETURNING *
      `, [actualProjectId, title]);
      
      logger.info(`Conversación creada: ${title} (proyecto: ${actualProjectId})`);
      return result.rows[0];
    } catch (error: any) {
      logger.error('Error creando conversación:', error);
      throw new Error(`No se pudo crear la conversación: ${error.message}`);
    }
  }

  /**
   * Obtiene todas las conversaciones no archivadas con información de proyecto
   * @returns Lista de conversaciones ordenadas por fecha de actualización
   */
  async getConversations(): Promise<Conversation[]> {
    try {
      const result = await this.client.query(`
        SELECT c.*, p.name as project_name 
        FROM conversations c 
        JOIN projects p ON c.project_id = p.id 
        WHERE c.is_archived = false 
        ORDER BY c.updated_at DESC
      `);
      
      return result.rows;
    } catch (error: any) {
      logger.error('Error obteniendo conversaciones:', error);
      throw new Error(`No se pudieron obtener las conversaciones: ${error.message}`);
    }
  }

  /**
   * Obtiene una conversación específica por su ID
   * @param conversationId - ID único de la conversación
   * @returns Conversación con datos de proyecto o null si no existe
   */
  async getConversationById(conversationId: string): Promise<Conversation | null> {
    try {
      const result = await this.client.query(`
        SELECT c.*, p.name as project_name 
        FROM conversations c 
        JOIN projects p ON c.project_id = p.id 
        WHERE c.id = $1
      `, [conversationId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error obteniendo conversación por ID:', error);
      return null;
    }
  }

  /**
   * Obtiene el ID del proyecto asociado a una conversación
   * @param conversationId - ID de la conversación
   * @returns ID del proyecto o null si no se encuentra
   */
  async getProjectIdByConversation(conversationId: string): Promise<string | null> {
    try {
      const result = await this.client.query(
        'SELECT project_id FROM conversations WHERE id = $1', 
        [conversationId]
      );
      return result.rows[0]?.project_id || null;
    } catch (error) {
      logger.error('Error obteniendo ID de proyecto:', error);
      return null;
    }
  }

  // ============================================================================
  // SECCIÓN 3: GESTIÓN DE MENSAJES
  // ============================================================================

  /**
   * Agrega un nuevo mensaje a una conversación y actualiza su timestamp
   * @param conversationId - ID de la conversación
   * @param role - Rol del mensaje ('user' o 'assistant')
   * @param content - Contenido del mensaje
   * @param metadata - Metadatos adicionales (uso de tokens, configuración, etc.)
   * @returns Mensaje creado con timestamp
   */
  async addMessage(
    conversationId: string, 
    role: string, 
    content: string, 
    metadata?: Record<string, any>
  ): Promise<Message> {
    try {
      const result = await this.client.query(`
        INSERT INTO messages (conversation_id, role, content, metadata) 
        VALUES ($1, $2, $3, $4) 
        RETURNING *
      `, [conversationId, role, content, metadata || {}]);
      
      // Actualizar timestamp de la conversación
      await this.client.query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1', 
        [conversationId]
      );
      
      return result.rows[0];
    } catch (error: any) {
      logger.error('Error agregando mensaje:', error);
      throw new Error(`No se pudo agregar el mensaje: ${error.message}`);
    }
  }

  /**
   * Obtiene los mensajes más recientes de una conversación
   * @param conversationId - ID de la conversación
   * @param limit - Número máximo de mensajes a obtener (por defecto 10)
   * @returns Lista de mensajes ordenados cronológicamente
   */
  async getMessages(conversationId: string, limit = 10): Promise<Message[]> {
    try {
      const result = await this.client.query(`
        SELECT * FROM messages 
        WHERE conversation_id = $1 
        ORDER BY timestamp ASC 
        LIMIT $2
      `, [conversationId, limit]);
      
      return result.rows;
    } catch (error: any) {
      logger.error('Error obteniendo mensajes:', error);
      throw new Error(`No se pudieron obtener los mensajes: ${error.message}`);
    }
  }

  // ============================================================================
  // SECCIÓN 4: BÚSQUEDA Y CONSULTAS AVANZADAS
  // ============================================================================

  /**
   * Realiza búsqueda de texto completo en conversaciones y mensajes
   * Utiliza las capacidades de PostgreSQL para búsqueda semántica
   * @param query - Término de búsqueda en lenguaje natural
   * @param limit - Número máximo de resultados (por defecto 10)
   * @returns Conversaciones que coinciden con la búsqueda, con títulos resaltados
   */
  async searchConversations(query: string, limit = 10): Promise<ConversationSearchResult[]> {
    try {
      // Búsqueda utilizando PostgreSQL Full-Text Search con ranking
      const result = await this.client.query(`
        SELECT DISTINCT c.*, p.name as project_name,
               ts_headline('english', c.title, plainto_tsquery('english', $1)) as highlighted_title,
               ts_rank(to_tsvector('english', c.title), plainto_tsquery('english', $1)) +
               ts_rank(to_tsvector('english', COALESCE(m.content, '')), plainto_tsquery('english', $1)) as rank
        FROM conversations c
        JOIN projects p ON c.project_id = p.id
        LEFT JOIN messages m ON c.id = m.conversation_id
        WHERE c.is_archived = false 
          AND (to_tsvector('english', c.title) @@ plainto_tsquery('english', $1)
               OR to_tsvector('english', COALESCE(m.content, '')) @@ plainto_tsquery('english', $1))
        ORDER BY rank DESC, c.updated_at DESC
        LIMIT $2
      `, [query, limit]);
      
      logger.info(`Búsqueda realizada: "${query}" - ${result.rows.length} resultados`);
      return result.rows;
    } catch (error: any) {
      logger.error('Error en búsqueda de conversaciones:', error);
      throw new Error(`Error en la búsqueda: ${error.message}`);
    }
  }

  // ============================================================================
  // SECCIÓN 5: UTILIDADES Y MANTENIMIENTO
  // ============================================================================

  /**
   * Cierra la conexión a la base de datos de forma segura
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.end();
      logger.info('Conexión a base de datos cerrada correctamente');
    } catch (error) {
      logger.error('Error cerrando conexión a base de datos:', error);
    }
  }

  /**
   * Ejecuta una verificación de estado de la base de datos
   * @returns Información de estado de las tablas principales
   */
  async healthCheck(): Promise<{
    connected: boolean;
    conversations: number;
    messages: number;
    projects: number;
  }> {
    try {
      const isConnected = await this.isConnected();
      
      if (!isConnected) {
        return { connected: false, conversations: 0, messages: 0, projects: 0 };
      }

      const [conversationsResult, messagesResult, projectsResult] = await Promise.all([
        this.client.query('SELECT COUNT(*) FROM conversations WHERE is_archived = false'),
        this.client.query('SELECT COUNT(*) FROM messages'),
        this.client.query('SELECT COUNT(*) FROM projects')
      ]);

      return {
        connected: true,
        conversations: parseInt(conversationsResult.rows[0].count),
        messages: parseInt(messagesResult.rows[0].count),
        projects: parseInt(projectsResult.rows[0].count)
      };
    } catch (error) {
      logger.error('Error en verificación de estado de base de datos:', error);
      return { connected: false, conversations: 0, messages: 0, projects: 0 };
    }
  }

  /**
   * Obtiene estadísticas básicas de uso de la base de datos
   * @returns Métricas de uso para monitoreo
   */
  async getUsageStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    averageMessagesPerConversation: number;
    mostActiveProject: string;
  }> {
    try {
      const statsQuery = await this.client.query(`
        SELECT 
          (SELECT COUNT(*) FROM conversations WHERE is_archived = false) as total_conversations,
          (SELECT COUNT(*) FROM messages) as total_messages,
          (SELECT AVG(message_count) FROM (
            SELECT COUNT(*) as message_count 
            FROM messages 
            GROUP BY conversation_id
          ) as avg_calc) as avg_messages_per_conversation,
          (SELECT p.name 
           FROM projects p 
           JOIN conversations c ON p.id = c.project_id 
           WHERE c.is_archived = false 
           GROUP BY p.id, p.name 
           ORDER BY COUNT(*) DESC 
           LIMIT 1) as most_active_project
      `);

      const stats = statsQuery.rows[0];
      return {
        totalConversations: parseInt(stats.total_conversations) || 0,
        totalMessages: parseInt(stats.total_messages) || 0,
        averageMessagesPerConversation: parseFloat(stats.avg_messages_per_conversation) || 0,
        mostActiveProject: stats.most_active_project || 'N/A'
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de uso:', error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        averageMessagesPerConversation: 0,
        mostActiveProject: 'N/A'
      };
    }
  }

  /**
   * Ejecutar query SQL genérico - para uso interno de otros services
   * @param sql SQL query string
   * @param params Parámetros para el query
   * @returns Resultado del query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    try {
      return await this.client.query(sql, params);
    } catch (error) {
      logger.error('Error ejecutando query:', { sql, error });
      throw error;
    }
  }
}

