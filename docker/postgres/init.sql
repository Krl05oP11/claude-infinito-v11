-- Claude Infinito v1.1 Database Schema
-- Inicialización completa con Conversational RAG + Knowledge Base
-- Versión: 3.0 - 29/09/2025

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- SISTEMA BASE - Projects & Conversations
-- ============================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500),
    summary TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    tokens_input INTEGER,
    tokens_output INTEGER,
    model VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE memory_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    title VARCHAR(500),
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence_score FLOAT DEFAULT 0.0,
    relevance_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- KNOWLEDGE BASE RAG LAYER - Documents & Chunks
-- ============================================================

CREATE TABLE documents (
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

CREATE TABLE document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE document_summaries (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    summary_embedding vector(1024),
    summary_type VARCHAR(50) DEFAULT 'auto_generated',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- CONVERSATIONAL RAG LAYER - Conversation Memory
-- ============================================================

CREATE TABLE conversation_threads (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    thread_summary TEXT,
    thread_embedding vector(1024),
    message_count INTEGER DEFAULT 0,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE message_pairs (
    id SERIAL PRIMARY KEY,
    conversation_thread_id INTEGER REFERENCES conversation_threads(id) ON DELETE CASCADE,
    user_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    assistant_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    pair_content TEXT NOT NULL,
    pair_embedding vector(1024),
    context_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE conversation_summaries (
    id SERIAL PRIMARY KEY,
    conversation_thread_id INTEGER REFERENCES conversation_threads(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    summary_embedding vector(1024),
    summary_level VARCHAR(50) DEFAULT 'thread',
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- CROSS-REFERENCES - Relaciones entre Conversaciones y Documentos
-- ============================================================

CREATE TABLE conversation_document_refs (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    relevance_score FLOAT DEFAULT 0.0,
    access_count INTEGER DEFAULT 0,
    last_referenced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (conversation_id, document_id)
);

-- ============================================================
-- MONITORING & ANALYTICS
-- ============================================================

CREATE TABLE api_usage (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    api_type VARCHAR(50),
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE rag_usage (
    id SERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    query_type VARCHAR(50),
    query_text TEXT,
    results_count INTEGER,
    execution_time_ms INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    artifact_type VARCHAR(100),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES - Optimización de Búsquedas
-- ============================================================

-- Indexes básicos
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_memory_contexts_project ON memory_contexts(project_id);
CREATE INDEX idx_memory_contexts_type ON memory_contexts(context_type);

-- Indexes para Knowledge Base RAG
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_filename ON documents(filename);
CREATE INDEX idx_document_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes para Conversational RAG
CREATE INDEX idx_conversation_threads_conv ON conversation_threads(conversation_id);
CREATE INDEX idx_conversation_threads_project ON conversation_threads(project_id);
CREATE INDEX idx_conversation_threads_embedding ON conversation_threads USING ivfflat (thread_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_message_pairs_thread ON message_pairs(conversation_thread_id);
CREATE INDEX idx_message_pairs_embedding ON message_pairs USING ivfflat (pair_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_conversation_summaries_thread ON conversation_summaries(conversation_thread_id);
CREATE INDEX idx_conversation_summaries_embedding ON conversation_summaries USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes para Cross-References
CREATE INDEX idx_conv_doc_refs_conv ON conversation_document_refs(conversation_id);
CREATE INDEX idx_conv_doc_refs_doc ON conversation_document_refs(document_id);
CREATE INDEX idx_conv_doc_refs_score ON conversation_document_refs(relevance_score DESC);

-- Full-text search indexes
CREATE INDEX idx_conversations_title_fts ON conversations USING gin(to_tsvector('english', title));
CREATE INDEX idx_messages_content_fts ON messages USING gin(to_tsvector('english', content));
CREATE INDEX idx_memory_contexts_content_fts ON memory_contexts USING gin(to_tsvector('english', summary || ' ' || content));
CREATE INDEX idx_documents_content_fts ON documents USING gin(to_tsvector('english', content));

-- ============================================================
-- TRIGGERS - Actualización Automática de Timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DATOS INICIALES - Proyecto Default
-- ============================================================

INSERT INTO projects (name, description, settings) 
VALUES (
    'default',
    'Proyecto por defecto de Claude Infinito',
    '{"theme": "dark", "embedding_model": "bge-large", "max_context_tokens": 8000}'::jsonb
);

-- ============================================================
-- PERMISOS - Usuario claude_user
-- ============================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO claude_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO claude_user;

-- Permisos para futuras tablas
DO $$
BEGIN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO claude_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO claude_user;
END
$$;
