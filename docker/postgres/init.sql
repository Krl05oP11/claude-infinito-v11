-- Claude Infinito v1.1 Database Schema
-- Inicialización completa con datos de ejemplo

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table
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

-- Messages table
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

-- Memory contexts for RAG
CREATE TABLE memory_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL, -- 'conversation', 'decision', 'code', 'architecture'
    title VARCHAR(500),
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding_id VARCHAR(255), -- ChromaDB embedding ID
    relevance_score FLOAT DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Artifacts (code, documents, etc.)
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'code', 'document', 'architecture', 'config'
    title VARCHAR(500),
    content TEXT NOT NULL,
    language VARCHAR(50),
    filename VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RAG usage tracking
CREATE TABLE rag_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    context_ids UUID[] NOT NULL,
    similarity_scores FLOAT[] NOT NULL,
    injection_successful BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API usage tracking
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_conversations_project_id ON conversations(project_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_memory_contexts_project_id ON memory_contexts(project_id);
CREATE INDEX idx_memory_contexts_type ON memory_contexts(context_type);
CREATE INDEX idx_memory_contexts_last_used ON memory_contexts(last_used DESC);
CREATE INDEX idx_artifacts_conversation_id ON artifacts(conversation_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_rag_usage_conversation_id ON rag_usage(conversation_id);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at DESC);

-- Full text search indexes
CREATE INDEX idx_conversations_title_fts ON conversations USING gin(to_tsvector('english', title));
CREATE INDEX idx_messages_content_fts ON messages USING gin(to_tsvector('english', content));
CREATE INDEX idx_memory_contexts_content_fts ON memory_contexts USING gin(to_tsvector('english', summary || ' ' || content));

-- Trigger functions for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default project
INSERT INTO projects (id, name, description, settings) VALUES (
    uuid_generate_v4(),
    'General',
    'Default project for general conversations',
    '{
        "auto_rag": true,
        "max_context_messages": 10,
        "embedding_model": "nomic-embed-text",
        "claude_model": "claude-3-5-sonnet-20241022"
    }'::jsonb
);

-- Grant permissions to application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO claude_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO claude_user;

-- Insert sample conversation for testing
DO $$
DECLARE
    project_id UUID;
    conversation_id UUID;
BEGIN
    -- Get default project ID
    SELECT id INTO project_id FROM projects WHERE name = 'General';
    
    -- Create sample conversation
    INSERT INTO conversations (id, project_id, title, summary) 
    VALUES (
        uuid_generate_v4(),
        project_id,
        'Welcome to Claude Infinito v1.1',
        'Initial setup and testing conversation'
    ) RETURNING id INTO conversation_id;
    
    -- Add welcome message
    INSERT INTO messages (conversation_id, role, content, model) VALUES (
        conversation_id,
        'assistant',
        'Welcome to Claude Infinito v1.1! This system provides unlimited context and memory across conversations. How can I help you today?',
        'claude-3-5-sonnet-20241022'
    );
END $$;
