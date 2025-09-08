// backend/src/api/routes/upload.ts

import express from 'express';
import { FileProcessorService } from '../../services/file-processor.service';
import { createLogger } from '../../utils/logger';

const router = express.Router();
const fileProcessor = new FileProcessorService();
const logger = createLogger();

// Configurar middleware de upload
const upload = fileProcessor.getUploadMiddleware();

// Endpoint para subir archivos individuales
router.post('/file', upload.single('file'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const file = req.file;
    const { projectId, conversationId } = req.body;

    if (!file) {
      res.status(400).json({ 
        success: false, 
        error: 'No file provided' 
      });
      return;
    }

    if (!projectId || !conversationId) {
      res.status(400).json({ 
        success: false, 
        error: 'projectId and conversationId are required' 
      });
      return;
    }

    logger.info(`📄 Processing uploaded file: ${file.originalname} (${file.size} bytes)`);

    const result = await fileProcessor.processFile(file, projectId, conversationId);

    if (result.success) {
      res.json({
        success: true,
        message: `File processed successfully`,
        filename: file.originalname,
        chunksProcessed: result.chunksProcessed,
        fileSize: file.size,
        fileType: file.mimetype
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to process file',
        filename: file.originalname
      });
    }

  } catch (error: any) {
    logger.error('Error in file upload endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Endpoint para subir múltiples archivos
router.post('/files', upload.array('files', 10), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    const { projectId, conversationId } = req.body;

    if (!files || files.length === 0) {
      res.status(400).json({ 
        success: false, 
        error: 'No files provided' 
      });
      return;
    }

    if (!projectId || !conversationId) {
      res.status(400).json({ 
        success: false, 
        error: 'projectId and conversationId are required' 
      });
      return;
    }

    logger.info(`📄 Processing ${files.length} uploaded files`);

    const results = [];

    for (const file of files) {
      const result = await fileProcessor.processFile(file, projectId, conversationId);
      
      results.push({
        filename: file.originalname,
        success: result.success,
        chunksProcessed: result.chunksProcessed,
        fileSize: file.size,
        error: result.error
      });
    }

    const successCount = results.filter(r => r.success).length;
    const totalChunks = results.reduce((sum, r) => sum + r.chunksProcessed, 0);

    res.json({
      success: successCount > 0,
      message: `Processed ${successCount}/${files.length} files successfully`,
      totalChunks,
      results
    });

  } catch (error: any) {
    logger.error('Error in multiple file upload endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Endpoint para obtener tipos de archivo soportados
router.get('/supported-types', (req: express.Request, res: express.Response): void => {
  res.json({
    supportedTypes: [
      { extension: '.txt', description: 'Text files' },
      { extension: '.md', description: 'Markdown files' },
      { extension: '.pdf', description: 'PDF documents' },
      { extension: '.docx', description: 'Word documents' },
      { extension: '.js', description: 'JavaScript files' },
      { extension: '.ts', description: 'TypeScript files' },
      { extension: '.py', description: 'Python files' },
      { extension: '.json', description: 'JSON files' },
      { extension: '.ipynb', description: 'Jupyter Notebooks' },
      { extension: '.css', description: 'CSS stylesheets' },
      { extension: '.html', description: 'HTML documents' },
      { extension: '.htm', description: 'HTML documents' },
      { extension: '.log', description: 'Log files' },
      { extension: '.yml', description: 'YAML files' },
      { extension: '.yaml', description: 'YAML files' },
      { extension: '.xml', description: 'XML files' }
    ],
    maxFileSize: '50MB',
    maxFiles: 10
  });
});

// Endpoint para buscar en archivos subidos
router.get('/search', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { query, projectId, limit = 5 } = req.query;

    if (!query || !projectId) {
      res.status(400).json({ 
        success: false, 
        error: 'query and projectId are required' 
      });
      return;
    }

    // Usar el RAG service para buscar en archivos
    const ragService = fileProcessor['ragService'];
    const memories = await ragService.searchRelevantContext(
      query as string, 
      projectId as string, 
      parseInt(limit as string)
    );

    const fileMemories = memories.filter(m => 
      m.metadata.source_type === 'file_upload'
    );

    res.json({
      success: true,
      query: query as string,
      results: fileMemories.map(memory => ({
        filename: memory.metadata.file_name,
        section: memory.metadata.section,
        content: memory.content.substring(0, 200) + '...',
        similarity: memory.metadata.similarity,
        fileType: memory.metadata.fileType,
        chunkIndex: memory.metadata.chunkIndex
      }))
    });

  } catch (error: any) {
    logger.error('Error in file search endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

export default router;
