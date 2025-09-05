import { config } from 'dotenv';
config();

import { Client } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export class DatabaseService {
  private client: Client;

  constructor() {
    this.client = new Client({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5433'),
      database: process.env.POSTGRES_DB || 'claude_infinito',
      user: process.env.POSTGRES_USER || 'claude_user',
      password: process.env.POSTGRES_PASSWORD || 'claude_password'
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  async createConversation(title: string, projectId = 'default'): Promise<any> {
    const projectResult = await this.client.query(
      'SELECT id FROM projects WHERE name = $1', 
      ['General']
    );
    
    const actualProjectId = projectResult.rows[0]?.id || projectId;
    
    const result = await this.client.query(`
      INSERT INTO conversations (project_id, title) 
      VALUES ($1, $2) 
      RETURNING *
    `, [actualProjectId, title]);
    
    return result.rows[0];
  }

  async getConversations(): Promise<any[]> {
    const result = await this.client.query(`
      SELECT c.*, p.name as project_name 
      FROM conversations c 
      JOIN projects p ON c.project_id = p.id 
      WHERE c.is_archived = false 
      ORDER BY c.updated_at DESC
    `);
    
    return result.rows;
  }

  async addMessage(conversationId: string, role: string, content: string, metadata?: any): Promise<any> {
    const result = await this.client.query(`
      INSERT INTO messages (conversation_id, role, content, metadata) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *
    `, [conversationId, role, content, metadata || {}]);
    
    await this.client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
    
    return result.rows[0];
  }

  async getMessages(conversationId: string, limit = 10): Promise<any[]> {
    const result = await this.client.query(`
      SELECT * FROM messages 
      WHERE conversation_id = $1 
      ORDER BY timestamp ASC 
      LIMIT $2
    `, [conversationId, limit]);
    
    return result.rows;
  }

  async getProjectIdByConversation(conversationId: string): Promise<string | null> {
    try {
      const result = await this.client.query('SELECT project_id FROM conversations WHERE id = $1', [conversationId]);
      return result.rows[0]?.project_id || null;
    } catch (error) {
      logger.error('Error getting project ID:', error);
      return null;
    }
  }

  async getConversationById(conversationId: string): Promise<any | null> {
    try {
      const result = await this.client.query(`
        SELECT c.*, p.name as project_name 
        FROM conversations c 
        JOIN projects p ON c.project_id = p.id 
        WHERE c.id = $1
      `, [conversationId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting conversation by ID:', error);
      return null;
    }
  }

  async searchConversations(query: string, limit = 10): Promise<any[]> {
    const result = await this.client.query(`
      SELECT DISTINCT c.*, p.name as project_name,
             ts_headline('english', c.title, plainto_tsquery('english', $1)) as highlighted_title
      FROM conversations c
      JOIN projects p ON c.project_id = p.id
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.is_archived = false 
        AND (to_tsvector('english', c.title) @@ plainto_tsquery('english', $1)
             OR to_tsvector('english', m.content) @@ plainto_tsquery('english', $1))
      ORDER BY c.updated_at DESC
      LIMIT $2
    `, [query, limit]);
    
    return result.rows;
  }
}
