-- ============================================================================
-- CLAUDE INFINITO v1.1 - POSTGRESQL DATABASE SCHEMA
-- ============================================================================
-- Sistema de Memoria Semántica Infinita con RAG Conversacional
-- PostgreSQL + pgvector para embeddings
-- Fecha: 02/10/2025
-- ============================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- TABLAS PRINCIPALES DEL SISTEMA
-- ============================================================================

-- Proyectos
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversaciones
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mensajes
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- ============================================================================
-- TABLAS RAG - KNOWLEDGE BASE
-- ============================================================================

-- Documentos subidos (archivos completos)
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);
CREATE INDEX IF NOT EXISTS idx_documents_content_fts ON documents USING GIN(to_tsvector('english', content));

-- Chunks de documentos con embeddings (para RAG de Knowledge Base)
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),  -- BGE-large genera embeddings de 1024 dimensiones
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- Resúmenes de documentos
CREATE TABLE IF NOT EXISTS document_summaries (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLAS RAG - MEMORIA CONVERSACIONAL
-- ============================================================================

-- Pares de mensajes (usuario + asistente) con embeddings
-- Usados para RAG conversacional - recuperar contexto de conversaciones previas
CREATE TABLE IF NOT EXISTS message_pairs (
    id SERIAL PRIMARY KEY,
    conversation_thread_id INTEGER,  -- Referencia a conversation_threads si existe
    user_message_id UUID,
    assistant_message_id UUID,
    pair_content TEXT NOT NULL,  -- Concatenación de user + assistant message
    pair_embedding vector(1024),  -- Embedding del par completo
    context_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_pairs_embedding ON message_pairs USING ivfflat (pair_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_message_pairs_created_at ON message_pairs(created_at DESC);

-- Hilos de conversación (agrupación de message pairs)
CREATE TABLE IF NOT EXISTS conversation_threads (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    thread_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLAS DE RELACIONES Y METADATOS
-- ============================================================================

-- Referencias entre conversaciones y documentos
CREATE TABLE IF NOT EXISTS conversation_document_refs (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    referenced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resúmenes de conversaciones completas
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contextos de memoria (para gestión inteligente de contexto)
CREATE TABLE IF NOT EXISTS memory_contexts (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLAS DE MONITOREO Y ESTADÍSTICAS
-- ============================================================================

-- Uso de RAG (métricas de búsquedas)
CREATE TABLE IF NOT EXISTS rag_usage (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    query_type VARCHAR(50) NOT NULL,  -- 'conversational', 'knowledge', 'hybrid'
    query_text TEXT NOT NULL,
    results_count INTEGER,
    avg_similarity FLOAT,
    threshold_used FLOAT,
    response_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_usage_conversation ON rag_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rag_usage_created_at ON rag_usage(created_at DESC);

-- Uso de API (métricas de Claude API)
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    model VARCHAR(100),
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Artefactos generados
CREATE TABLE IF NOT EXISTS artifacts (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    artifact_type VARCHAR(50),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ============================================================================

COMMENT ON TABLE documents IS 'Almacena archivos completos subidos por el usuario (PDF, TXT, MD, etc.)';
COMMENT ON TABLE document_chunks IS 'Chunks de documentos con embeddings para búsqueda semántica (Knowledge Base RAG)';
COMMENT ON TABLE message_pairs IS 'Pares usuario-asistente con embeddings para búsqueda conversacional (Conversational RAG)';
COMMENT ON TABLE conversation_threads IS 'Hilos de conversación para agrupar message_pairs relacionados';
COMMENT ON TABLE rag_usage IS 'Métricas de uso del sistema RAG para monitoreo y optimización';

COMMENT ON COLUMN document_chunks.embedding IS 'Vector de 1024 dimensiones generado por bge-large-en-v1.5';
COMMENT ON COLUMN message_pairs.pair_embedding IS 'Vector de 1024 dimensiones del par conversacional completo';
COMMENT ON COLUMN documents.metadata IS 'Metadatos adicionales: autor, tags, categoría, etc.';
COMMENT ON COLUMN message_pairs.context_metadata IS 'Metadatos del contexto: intent, entities, sentiment, etc.';

-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================
