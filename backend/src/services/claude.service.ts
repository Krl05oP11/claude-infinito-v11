import { config } from 'dotenv';
config();

import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number; };
}

export class ClaudeService {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    config();
    this.apiKey = process.env.CLAUDE_API_KEY || '';
    this.baseURL = process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com';
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

    logger.info(`API Key status: ${this.apiKey ? 'CONFIGURED' : 'MISSING'}`);
  }

  async sendMessage(messages: ClaudeMessage[], maxTokens = 4000): Promise<ClaudeResponse> {
    if (!this.apiKey) {
      return this.getMockResponse(messages[messages.length - 1].content);
    }

    try {
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const payload: any = {
        model: this.model,
        max_tokens: maxTokens,
        messages: userMessages
      };

      if (systemMessage?.content) {
        payload.system = systemMessage.content;
      }

      const response = await axios.post(`${this.baseURL}/v1/messages`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      return response.data;
    } catch (error: any) {
      logger.error('Claude API error details:', error.response?.data || error.message);
      throw new Error('Failed to communicate with Claude API');
    }
  }

  private getMockResponse(userMessage: string): ClaudeResponse {
    return {
      content: [{ type: 'text', text: `Mock response to: "${userMessage}".` }],
      model: this.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: userMessage.length / 4, output_tokens: 50 }
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
