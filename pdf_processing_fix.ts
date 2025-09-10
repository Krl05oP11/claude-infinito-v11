// backend/src/services/file-processor.service.ts - COMPLETE FIXED VERSION

import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { RAGService } from './rag.service';
const pdfParse = require('pdf-parse'); // NEW: PDF parsing library

interface FileChunk {
  id: string;
  content: string;
  metadata: {
    filename: string;
    fileType: string;
    chunkIndex: number;
    totalChunks: number;
    section?: string;
    language?: string;
    [key: string]: any;
  };
}

export class FileProcessorService {
  private ragService: RAGService;
  private supportedTypes = [
    '.txt', '.md', '.pdf', '.docx',           // Documentos
    '.js', '.ts', '.py', '.json',             // Código
    '.ipynb',                                 // Jupyter notebooks
    '.css', '.html', '.htm',                  // Web
    '.log', '.yml', '.yaml', '.xml'           // Configuración/logs
  ];

  constructor() {
    this.ragService = new RAGService();
  }

  // Configurar multer para upload
  getUploadMiddleware() {
    const storage = multer.memoryStorage();
    
    return multer({
      storage,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB máximo
      },
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (this.supportedTypes.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error(`Tipo de archivo no soportado: ${ext}`));
        }
      }
    });
  }

  // FIXED: Procesar archivo según su tipo
  async processFile(
    file: Express.Multer.File, 
    projectId: string, 
    conversationId: string
  ): Promise<{ success: boolean; chunksProcessed: number; error?: string }> {
    try {
      console.log(`📄 Processing file: ${file.originalname} (${file.size} bytes)`);
      
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      // FIXED: Don't convert binary files to UTF-8
      let content: string = '';
      let chunks: FileChunk[] = [];
      
      switch (fileExtension) {
        case '.pdf':
          // NEW: Handle PDFs with proper text extraction
          chunks = await this.processPDFFile(file.buffer, file.originalname);
          break;
        case '.docx':
          // TODO: Implement DOCX processing (future enhancement)
          console.warn(`⚠️ DOCX processing not implemented yet for ${file.originalname}`);
          chunks = await this.processGenericFile(file.buffer.toString('utf-8'), file.originalname);
          break;
        case '.ipynb':
          content = file.buffer.toString('utf-8');
          chunks = await this.processJupyterNotebook(content, file.originalname);
          break;
        case '.css':
          content = file.buffer.toString('utf-8');
          chunks = await this.processCSSFile(content, file.originalname);
          break;
        case '.html':
        case '.htm':
          content = file.buffer.toString('utf-8');
          chunks = await this.processHTMLFile(content, file.originalname);
          break;
        case '.js':
        case '.ts':
          content = file.buffer.toString('utf-8');
          chunks = await this.processCodeFile(content, file.originalname, fileExtension);
          break;
        case '.md':
          content = file.buffer.toString('utf-8');
          chunks = await this.processMarkdownFile(content, file.originalname);
          break;
        case '.json':
          content = file.buffer.toString('utf-8');
          chunks = await this.processJSONFile(content, file.originalname);
          break;
        case '.txt':
        case '.log':
          content = file.buffer.toString('utf-8');
          chunks = await this.processTextFile(content, file.originalname);
          break;
        default:
          content = file.buffer.toString('utf-8');
          chunks = await this.processGenericFile(content, file.originalname);
      }

      // Almacenar chunks en ChromaDB
      let storedCount = 0;
      for (const chunk of chunks) {
        const success = await this.ragService.addMemory(
          projectId,
          conversationId,
          chunk.content,
          {
            ...chunk.metadata,
            source_type: 'file_upload',
            file_name: file.originalname,
            upload_timestamp: new Date().toISOString()
          }
        );
        
        if (success) storedCount++;
      }

      console.log(`✅ Processed ${file.originalname}: ${storedCount}/${chunks.length} chunks stored`);
      
      return {
        success: true,
        chunksProcessed: storedCount
      };

    } catch (error: any) {
      console.error(`❌ Error processing file ${file.originalname}:`, error.message);
      return {
        success: false,
        chunksProcessed: 0,
        error: error.message
      };
    }
  }

  // NEW: Process PDF files with proper text extraction
  private async processPDFFile(buffer: Buffer, filename: string): Promise<FileChunk[]> {
    console.log(`📄 Processing PDF: ${filename}`);
    
    try {
      // Extract text from PDF using pdf-parse
      const data = await pdfParse(buffer);
      const extractedText = data.text;
      
      if (!extractedText || extractedText.trim().length === 0) {
        console.warn(`⚠️ No text extracted from PDF: ${filename}`);
        return [{
          id: `${filename}_empty`,
          content: `PDF file "${filename}" processed but no readable text found. This might be a scanned document or image-based PDF.`,
          metadata: {
            filename,
            fileType: 'pdf',
            chunkIndex: 0,
            totalChunks: 1,
            section: 'Empty PDF',
            language: 'text',
            pages: data.numpages || 0,
            pdfInfo: data.info || {}
          }
        }];
      }

      console.log(`📊 PDF ${filename}: ${data.numpages} pages, ${extractedText.length} characters extracted`);

      // Split text into logical chunks
      const chunks: FileChunk[] = [];
      const maxChunkSize = 1500;
      const textChunks = this.chunkText(extractedText, maxChunkSize);
      
      textChunks.forEach((chunk, i) => {
        const estimatedPage = Math.floor((i / textChunks.length) * (data.numpages || 1)) + 1;
        
        chunks.push({
          id: `${filename}_pdf_chunk_${i}`,
          content: chunk,
          metadata: {
            filename,
            fileType: 'pdf',
            chunkIndex: i,
            totalChunks: textChunks.length,
            section: `Page ~${estimatedPage}`,
            language: 'text',
            pages: data.numpages || 0,
            estimatedPage: estimatedPage,
            pdfInfo: data.info || {}
          }
        });
      });

      console.log(`📊 PDF processed: ${chunks.length} chunks generated from ${data.numpages} pages`);
      return chunks;

    } catch (error: any) {
      console.error(`❌ Error processing PDF ${filename}:`, error.message);
      
      // Fallback: create error chunk
      return [{
        id: `${filename}_error`,
        content: `Error processing PDF "${filename}": ${error.message}. The file might be corrupted, password-protected, or in an unsupported format.`,
        metadata: {
          filename,
          fileType: 'pdf',
          chunkIndex: 0,
          totalChunks: 1,
          section: 'PDF Error',
          language: 'text',
          error: error.message
        }
      }];
    }
  }

  // Procesar Jupyter Notebook (.ipynb)
  private async processJupyterNotebook(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    
    try {
      const notebook = JSON.parse(content);
      const cells = notebook.cells || [];
      
      let chunkIndex = 0;
      
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const cellType = cell.cell_type;
        const cellSource = Array.isArray(cell.source) 
          ? cell.source.join('') 
          : cell.source || '';

        if (cellSource.trim()) {
          chunks.push({
            id: `${filename}_cell_${i}`,
            content: `[${cellType.toUpperCase()} CELL ${i + 1}]\n${cellSource}`,
            metadata: {
              filename,
              fileType: 'jupyter_notebook',
              chunkIndex: chunkIndex++,
              totalChunks: 0, // Se actualizará al final
              section: `Cell ${i + 1}`,
              cellType,
              cellIndex: i
            }
          });
        }

        // Si es código con output, agregar el output también
        if (cellType === 'code' && cell.outputs && cell.outputs.length > 0) {
          const outputText = cell.outputs
            .map((output: any) => {
              if (output.text) return Array.isArray(output.text) ? output.text.join('') : output.text;
              if (output.data && output.data['text/plain']) return output.data['text/plain'];
              return '';
            })
            .filter(Boolean)
            .join('\n');

          if (outputText.trim()) {
            chunks.push({
              id: `${filename}_output_${i}`,
              content: `[OUTPUT CELL ${i + 1}]\n${outputText}`,
              metadata: {
                filename,
                fileType: 'jupyter_notebook',
                chunkIndex: chunkIndex++,
                totalChunks: 0,
                section: `Cell ${i + 1} Output`,
                cellType: 'output',
                cellIndex: i
              }
            });
          }
        }
      }

      // Actualizar totalChunks
      chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
      
      return chunks;
    } catch (error) {
      console.error('Error parsing Jupyter notebook:', error);
      return this.processGenericFile(content, filename);
    }
  }

  // Procesar archivo CSS
  private async processCSSFile(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    
    // Dividir por reglas CSS principales
    const cssRules = content.split(/(?=\s*[.#@][^{]*\{)/);
    
    let chunkIndex = 0;
    
    for (let i = 0; i < cssRules.length; i++) {
      const rule = cssRules[i].trim();
      
      if (rule && rule.length > 10) { // Filtrar reglas muy pequeñas
        // Extraer selector si es posible
        const selectorMatch = rule.match(/^([^{]+)\{/);
        const selector = selectorMatch ? selectorMatch[1].trim() : 'Global styles';
        
        chunks.push({
          id: `${filename}_rule_${i}`,
          content: rule,
          metadata: {
            filename,
            fileType: 'css',
            chunkIndex: chunkIndex++,
            totalChunks: 0,
            section: selector,
            language: 'css'
          }
        });
      }
    }

    chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
    return chunks.length > 0 ? chunks : this.processGenericFile(content, filename);
  }

  // Procesar archivo HTML
  private async processHTMLFile(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    
    // Dividir por secciones principales de HTML
    const sections = [
      { pattern: /<head[^>]*>[\s\S]*?<\/head>/i, name: 'HEAD' },
      { pattern: /<title[^>]*>[\s\S]*?<\/title>/i, name: 'TITLE' },
      { pattern: /<nav[^>]*>[\s\S]*?<\/nav>/gi, name: 'NAVIGATION' },
      { pattern: /<header[^>]*>[\s\S]*?<\/header>/gi, name: 'HEADER' },
      { pattern: /<main[^>]*>[\s\S]*?<\/main>/gi, name: 'MAIN' },
      { pattern: /<section[^>]*>[\s\S]*?<\/section>/gi, name: 'SECTION' },
      { pattern: /<article[^>]*>[\s\S]*?<\/article>/gi, name: 'ARTICLE' },
      { pattern: /<footer[^>]*>[\s\S]*?<\/footer>/gi, name: 'FOOTER' },
      { pattern: /<script[^>]*>[\s\S]*?<\/script>/gi, name: 'SCRIPT' },
      { pattern: /<style[^>]*>[\s\S]*?<\/style>/gi, name: 'STYLE' }
    ];

    let chunkIndex = 0;
    let processedContent = content;
    
    for (const section of sections) {
      const matches = Array.from(content.matchAll(new RegExp(section.pattern.source, section.pattern.flags)));
      
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i][0];
        
        chunks.push({
          id: `${filename}_${section.name.toLowerCase()}_${i}`,
          content: match,
          metadata: {
            filename,
            fileType: 'html',
            chunkIndex: chunkIndex++,
            totalChunks: 0,
            section: `${section.name} ${i + 1}`,
            language: 'html'
          }
        });
        
        // Remover del contenido procesado
        processedContent = processedContent.replace(match, '');
      }
    }

    // Procesar contenido restante en chunks de 1000 caracteres
    const remainingContent = processedContent.replace(/<[^>]*>/g, ' ').trim();
    if (remainingContent.length > 100) {
      const textChunks = this.chunkText(remainingContent, 1000);
      
      textChunks.forEach((chunk, i) => {
        chunks.push({
          id: `${filename}_content_${i}`,
          content: chunk,
          metadata: {
            filename,
            fileType: 'html',
            chunkIndex: chunkIndex++,
            totalChunks: 0,
            section: `Text Content ${i + 1}`,
            language: 'html'
          }
        });
      });
    }

    chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
    return chunks.length > 0 ? chunks : this.processGenericFile(content, filename);
  }

  // Procesar archivos de código (JS/TS)
  private async processCodeFile(content: string, filename: string, extension: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    
    // Dividir por funciones/clases/exports principales
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+\w+[\s\S]*?(?=(?:export\s+)?(?:async\s+)?function|\nexport|\n\/\/|$)/g,
      /(?:export\s+)?class\s+\w+[\s\S]*?(?=(?:export\s+)?class|\nexport|\n\/\/|$)/g,
      /(?:export\s+)?const\s+\w+\s*=[\s\S]*?(?=(?:export\s+)?const|\nexport|\n\/\/|$)/g,
      /\/\*[\s\S]*?\*\//g  // Comentarios de bloque
    ];

    let chunkIndex = 0;
    let processedIndexes = new Set<number>();

    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern));
      
      for (const match of matches) {
        if (!processedIndexes.has(match.index!)) {
          const codeBlock = match[0];
          const functionMatch = codeBlock.match(/(?:function|class|const)\s+(\w+)/);
          const name = functionMatch ? functionMatch[1] : `Block ${chunkIndex + 1}`;
          
          chunks.push({
            id: `${filename}_${name}_${chunkIndex}`,
            content: codeBlock,
            metadata: {
              filename,
              fileType: 'code',
              chunkIndex: chunkIndex++,
              totalChunks: 0,
              section: name,
              language: extension.substring(1)
            }
          });
          
          processedIndexes.add(match.index!);
        }
      }
    }

    chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
    return chunks.length > 0 ? chunks : this.processGenericFile(content, filename);
  }

  // Procesar archivos Markdown
  private async processMarkdownFile(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    
    // Dividir por headers
    const sections = content.split(/^(#{1,6}\s+.+)$/gm);
    
    let chunkIndex = 0;
    let currentHeader = 'Introduction';
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      
      if (section.match(/^#{1,6}\s+/)) {
        currentHeader = section.replace(/^#{1,6}\s+/, '');
      } else if (section && section.length > 50) {
        chunks.push({
          id: `${filename}_section_${chunkIndex}`,
          content: section,
          metadata: {
            filename,
            fileType: 'markdown',
            chunkIndex: chunkIndex++,
            totalChunks: 0,
            section: currentHeader,
            language: 'markdown'
          }
        });
      }
    }

    chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
    return chunks.length > 0 ? chunks : this.processGenericFile(content, filename);
  }

  // Procesar archivos JSON
  private async processJSONFile(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    
    try {
      const jsonData = JSON.parse(content);
      
      // Si es un objeto, dividir por claves principales
      if (typeof jsonData === 'object' && !Array.isArray(jsonData)) {
        let chunkIndex = 0;
        
        for (const [key, value] of Object.entries(jsonData)) {
          chunks.push({
            id: `${filename}_${key}`,
            content: `${key}: ${JSON.stringify(value, null, 2)}`,
            metadata: {
              filename,
              fileType: 'json',
              chunkIndex: chunkIndex++,
              totalChunks: 0,
              section: key,
              language: 'json'
            }
          });
        }
      } else {
        // Array o estructura simple
        chunks.push({
          id: `${filename}_content`,
          content: JSON.stringify(jsonData, null, 2),
          metadata: {
            filename,
            fileType: 'json',
            chunkIndex: 0,
            totalChunks: 1,
            section: 'Full Content',
            language: 'json'
          }
        });
      }

      chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
      return chunks;
    } catch (error) {
      return this.processGenericFile(content, filename);
    }
  }

  // Procesar archivos de texto plano
  private async processTextFile(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    const textChunks = this.chunkText(content, 1500);
    
    textChunks.forEach((chunk, i) => {
      chunks.push({
        id: `${filename}_chunk_${i}`,
        content: chunk,
        metadata: {
          filename,
          fileType: 'text',
          chunkIndex: i,
          totalChunks: textChunks.length,
          section: `Chunk ${i + 1}`,
          language: 'text'
        }
      });
    });

    return chunks;
  }

  // Procesar archivos genéricos
  private async processGenericFile(content: string, filename: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    const textChunks = this.chunkText(content, 1200);
    
    textChunks.forEach((chunk, i) => {
      chunks.push({
        id: `${filename}_generic_${i}`,
        content: chunk,
        metadata: {
          filename,
          fileType: 'generic',
          chunkIndex: i,
          totalChunks: textChunks.length,
          section: `Section ${i + 1}`,
          language: 'unknown'
        }
      });
    });

    return chunks;
  }

  // Utilidad para dividir texto en chunks
  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+\s+/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxLength && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
}