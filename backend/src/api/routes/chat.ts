import express from 'express';
import { ClaudeService } from '../../services/claude.service';
import { createLogger } from '../../utils/logger';

const router = express.Router();
const claudeService = new ClaudeService();
const logger = createLogger();

router.post('/test', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { message } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message required' });
      return;
    }

    const response = await claudeService.sendMessage([
      { role: 'user', content: message }
    ]);

    res.json({
      response: response.content[0]?.text,
      usage: response.usage,
      configured: claudeService.isConfigured()
    });
  } catch (error) {
    logger.error('Chat test error:', error);
    res.status(500).json({ error: 'Chat test failed' });
  }
});

export default router;
