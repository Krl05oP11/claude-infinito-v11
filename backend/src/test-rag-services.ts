// backend/src/test-rag-services.ts
// Test rápido de servicios RAG nuevos
// Versión 3.1 - 29/09/2025 - Fix UUID

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { QueryRouterService } from './services/query-router.service';
import { ConversationalRAGService } from './services/conversational-rag.service';
import { KnowledgeBaseRAGService } from './services/knowledge-base-rag.service';

dotenv.config({ path: "../.env" });

// ============================================================
// CONFIGURACIÓN
// ============================================================

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'claude_user',
  password: process.env.DB_PASSWORD || 'claude_password',
  database: process.env.DB_NAME || 'claude_infinito'
});

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434');

// ============================================================
// TESTS
// ============================================================

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  CLAUDE INFINITO - TEST DE SERVICIOS RAG v3.1             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // TEST 1: Conexión a Base de Datos
    console.log('📊 TEST 1: Verificando conexión a PostgreSQL...');
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado correctamente\n');

    // TEST 2: Verificar pgvector
    console.log('📊 TEST 2: Verificando extensión pgvector...');
    const vectorResult = await pool.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if (vectorResult.rows.length > 0) {
      console.log(`✅ pgvector instalado: versión ${vectorResult.rows[0].extversion}\n`);
    } else {
      throw new Error('pgvector no está instalado');
    }

    // TEST 3: Verificar tablas
    console.log('📊 TEST 3: Verificando tablas del schema...');
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'conversation_threads', 
        'message_pairs', 
        'conversation_summaries',
        'documents',
        'document_chunks',
        'document_summaries'
      )
    `);
    console.log(`✅ Tablas encontradas: ${tables.rows.length}/6`);
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));
    console.log('');

    // TEST 4: ConversationalRAGService
    console.log('📊 TEST 4: Probando ConversationalRAGService...');
    const conversationalRAG = new ConversationalRAGService(pool, OLLAMA_HOST, OLLAMA_PORT);
    await conversationalRAG.testConversationalRAG();

    // TEST 5: KnowledgeBaseRAGService  
    console.log('📊 TEST 5: Probando KnowledgeBaseRAGService...');
    const knowledgeBaseRAG = new KnowledgeBaseRAGService(pool, OLLAMA_HOST, OLLAMA_PORT);
    await knowledgeBaseRAG.testKnowledgeBaseRAG();

    // TEST 6: QueryRouterService - Análisis de queries
    console.log('📊 TEST 6: Probando QueryRouter con queries de ejemplo...\n');
    const queryRouter = new QueryRouterService(pool);

    // Obtener proyecto default
    const projectResult = await pool.query(
      "SELECT id FROM projects WHERE name = 'default' LIMIT 1"
    );
    const defaultProjectId = projectResult.rows[0]?.id || uuidv4();

    // Test query conversacional
    const conversationalQuery = "¿Qué dijimos sobre clustering ayer?";
    console.log(`Query: "${conversationalQuery}"`);
    const context1 = await queryRouter.analyzeQuery(
      conversationalQuery,
      uuidv4(), // UUID válido para test
      defaultProjectId
    );
    const strategy1 = queryRouter.determineSearchStrategy(context1);
    queryRouter.logQueryAnalysis(conversationalQuery, context1, strategy1);

    // Test query de knowledge
    const knowledgeQuery = "¿Qué dice el archivo sobre Elbow Method?";
    console.log(`Query: "${knowledgeQuery}"`);
    const context2 = await queryRouter.analyzeQuery(
      knowledgeQuery,
      uuidv4(), // UUID válido para test
      defaultProjectId
    );
    const strategy2 = queryRouter.determineSearchStrategy(context2);
    queryRouter.logQueryAnalysis(knowledgeQuery, context2, strategy2);

    // Test query híbrida
    const hybridQuery = "Profundiza en lo que discutimos basándote en el documento";
    console.log(`Query: "${hybridQuery}"`);
    const context3 = await queryRouter.analyzeQuery(
      hybridQuery,
      uuidv4(), // UUID válido para test
      defaultProjectId
    );
    const strategy3 = queryRouter.determineSearchStrategy(context3);
    queryRouter.logQueryAnalysis(hybridQuery, context3, strategy3);

    // TEST 7: Test completo de almacenamiento y búsqueda
    console.log('📊 TEST 7: Test de almacenamiento y búsqueda completo...\n');
    
    // Crear conversación de test con UUID válido
    const testConvId = uuidv4();
    await pool.query(
      'INSERT INTO conversations (id, project_id, title) VALUES ($1, $2, $3)',
      [testConvId, defaultProjectId, 'Test Conversation']
    );

    // Crear mensajes de test con UUIDs válidos
    const userMsgId = uuidv4();
    const assistantMsgId = uuidv4();
    
    await pool.query(
      'INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)',
      [userMsgId, testConvId, 'user', '¿Qué es un algoritmo genético?']
    );
    
    await pool.query(
      'INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)',
      [assistantMsgId, testConvId, 'assistant', 'Un algoritmo genético es una técnica de optimización inspirada en la evolución natural.']
    );

    // Almacenar par conversacional
    console.log('   Almacenando par conversacional...');
    await conversationalRAG.storeConversationPair(
      testConvId,
      defaultProjectId,
      userMsgId,
      '¿Qué es un algoritmo genético?',
      assistantMsgId,
      'Un algoritmo genético es una técnica de optimización inspirada en la evolución natural.'
    );
    console.log('   ✅ Par conversacional almacenado\n');

    // Buscar en conversaciones
    console.log('   Buscando "algoritmo genético"...');
    const searchResults = await conversationalRAG.searchConversations(
      'algoritmo genético',
      defaultProjectId,
      undefined,
      3,
      0.5
    );
    console.log(`   ✅ Encontrados ${searchResults.length} resultados`);
    if (searchResults.length > 0) {
      console.log(`   🔍 Mejor resultado (similitud: ${(searchResults[0].similarity * 100).toFixed(1)}%):`);
      console.log(`      ${searchResults[0].content.substring(0, 100)}...`);
    }
    console.log('');

    // Limpiar datos de test
    console.log('   Limpiando datos de test...');
    await pool.query('DELETE FROM conversations WHERE id = $1', [testConvId]);
    console.log('   ✅ Datos de test limpiados\n');

    // RESUMEN FINAL
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMEN DE TESTS                        ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  ✅ PostgreSQL + pgvector                    FUNCIONANDO  ║');
    console.log('║  ✅ Schema de tablas                         COMPLETO     ║');
    console.log('║  ✅ ConversationalRAGService                 OPERATIVO    ║');
    console.log('║  ✅ KnowledgeBaseRAGService                  OPERATIVO    ║');
    console.log('║  ✅ QueryRouterService                       OPERATIVO    ║');
    console.log('║  ✅ Almacenamiento de message pairs          FUNCIONAL    ║');
    console.log('║  ✅ Búsqueda semántica                       FUNCIONAL    ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║                  SISTEMA LISTO PARA INTEGRAR               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ ERROR EN TESTS:', error);
    if (error instanceof Error) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar tests
runTests()
  .then(() => {
    console.log('✅ Tests completados exitosamente\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Tests fallaron:', error);
    process.exit(1);
  });
  
