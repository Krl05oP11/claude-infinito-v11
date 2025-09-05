import { config } from 'dotenv';
config();

import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export class EmbeddingService {
  private ollamaHost: string;
  private ollamaPort: string;
  private model: string;

  constructor() {
    this.ollamaHost = process.env.OLLAMA_HOST || 'localhost';
    this.ollamaPort = process.env.OLLAMA_PORT || '11434';
    this.model = process.env.OLLAMA_MODEL || 'nomic-embed-text';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        `http://${this.ollamaHost}:${this.ollamaPort}/api/embeddings`,
        {
          model: this.model,
          prompt: text
        },
        { timeout: 10000 }
      );

      return response.data.embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`http://${this.ollamaHost}:${this.ollamaPort}/api/tags`);
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
