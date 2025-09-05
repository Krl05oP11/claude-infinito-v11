# Claude Infinito v1.1 - Documentación Completa del Proyecto

## INFORMACIÓN DEL USUARIO

**Nombre:** Carlos  
**Ubicación:** Crespo, Entre Ríos, Argentina  
**Sistema:** Ubuntu 24.04 LTS  
**Resolución:** 1920x1900 en monitor de 27"  
**Condición importante:** Fotofóbico - Requiere interfaces con colores oscuros y cálidos, evitar blancos, azules y celestes

## ESTADO INICIAL DEL PROYECTO

### Contexto Previo
- Proyecto iniciado previamente con chat básico funcional
- Sistema de chat con Claude API operativo pero primitivo
- Backend, frontend y base de datos PostgreSQL funcionando
- Problema reportado: UI con colores claros muy irritantes para fotofobia
- Sistema RAG implementado pero no integrado en el flujo de chat

### Estado al Inicio de Esta Sesión
✅ **Backend API**: Node.js + Express + TypeScript operativo  
✅ **Base de datos**: PostgreSQL con conversaciones y mensajes persistentes  
✅ **Claude API**: Integración real con Claude Sonnet 4 funcionando  
✅ **Frontend**: React con interfaz de chat funcional pero con colores problemáticos  
✅ **Memoria persistente**: Conversaciones guardadas entre sesiones  
✅ **Sistema completo**: Chat desktop funcional

## ARQUITECTURA DEL PROYECTO

### Estructura de Carpetas
```
claude-infinito-v11/
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── api/routes/
│   │   │   ├── chat.ts
│   │   │   └── conversations.ts
│   │   ├── database/
│   │   ├── index.ts
│   │   ├── services/
│   │   │   ├── claude.service.ts
│   │   │   ├── database.service.ts
│   │   │   ├── embedding.service.ts
│   │   │   └── rag.service.ts
│   │   ├── types/
│   │   └── utils/
│   │       └── logger.ts
│   ├── tests/
│   └── tsconfig.json
├── data/
│   ├── backups/
│   ├── chromadb/
│   ├── conversations/
│   └── postgres/
├── docker/
│   ├── chromadb/
│   ├── Dockerfile.backend
│   └── postgres/
│       └── init.sql
├── docker-compose.yml
├── docs/
├── frontend/
│   ├── electron.js
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js
│       ├── components/
│       ├── index.js
│       ├── services/
│       ├── types/
│       └── utils/
├── logs/
├── package.json
├── package-lock.json
├── README.md
├── scripts/
│   ├── dev.sh
│   └── setup.sh
└── transfer_report_chat02.md
```

## CONFIGURACIONES CLAVE

### Package.json Principal
```json
{
  "name": "claude-infinito-v11",
  "version": "1.1.0",
  "description": "Unlimited context chat interface with Claude API and persistent memory",
  "main": "frontend/electron.js",
  "private": true,
  "workspaces": ["backend"],
  "scripts": {
    "setup": "bash scripts/setup.sh",
    "dev": "bash scripts/dev.sh",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  }
}
```

### Backend Package.json
- TypeScript backend con Express
- Dependencias: axios, chromadb, pg, winston, cors, helmet
- Scripts: npm run dev (nodemon), npm run build, npm test

### Frontend Package.json  
- React 18 con Material-UI
- Electron para aplicación desktop
- Scripts: npm start, npm run electron-dev

### Archivo .env Backend (configurado y funcional)
```bash
# Claude API Configuration
CLAUDE_API_KEY=sk-ant-api03-[CLAVE_REAL_CONFIGURADA]
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_BASE_URL=https://api.anthropic.com

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DB=claude_infinito
POSTGRES_USER=claude_user
POSTGRES_PASSWORD=claude_password

# ChromaDB Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8001
CHROMA_AUTH_TOKEN=claude-infinito-secret-key-change-this

# Ollama Configuration
OLLAMA_HOST=localhost
OLLAMA_PORT=11434
OLLAMA_MODEL=nomic-embed-text

# Backend Configuration
BACKEND_PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
MOCK_CLAUDE_API=false

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6380

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

## SERVICIOS Y ARQUITECTURA

### Base de Datos PostgreSQL (docker/postgres/init.sql)
Schema completo implementado con:
- **projects**: Gestión de proyectos
- **conversations**: Conversaciones persistentes  
- **messages**: Mensajes usuario/asistente
- **memory_contexts**: Contextos RAG
- **artifacts**: Código y documentos generados
- **rag_usage**: Tracking de uso RAG
- **api_usage**: Métricas de API

Características avanzadas:
- Índices full-text search
- Triggers para updated_at
- UUID primary keys
- Extensiones pg_trgm para búsqueda
- Proyecto por defecto "General" creado

### Docker Compose (docker-compose.yml)
Servicios configurados:
- **PostgreSQL**: Puerto 5433, volumen persistente
- **ChromaDB**: Puerto 8001, autenticación configurada  
- **Redis**: Puerto 6380, configuración LRU
- **Backend**: Build desde Dockerfile.backend
- **PgAdmin**: Puerto 5050 (desarrollo)

Health checks configurados para todos los servicios.

### Backend Services

#### claude.service.ts
- Integración completa con Claude API
- Fallback mock si no hay API key
- Modelo: claude-sonnet-4-20250514
- Gestión de tokens y rate limiting

#### database.service.ts
- Cliente PostgreSQL
- CRUD completo para conversaciones y mensajes
- Búsqueda full-text implementada
- Gestión de proyectos

#### rag.service.ts  
- Integración con ChromaDB
- Gestión de colecciones por proyecto
- Búsqueda semántica con threshold 0.7
- Health check de ChromaDB

#### embedding.service.ts
- Integración con Ollama para embeddings
- Modelo: nomic-embed-text
- Timeout configurado: 10s

### Frontend React (frontend/src/App.js)
Aplicación single-page con Material-UI:
- Lista de conversaciones en sidebar
- Área de chat principal  
- Integración con backend API
- Gestión de estado con hooks

## PROBLEMAS IDENTIFICADOS Y RESUELTOS

### 1. Problema de Fotofobia - RESUELTO ✅
**Problema:** UI con colores blancos, azules y celestes muy irritantes
**Solución:** Tema completo oscuro y cálido implementado:
- Fondo principal: Gris oscuro cálido (#2E2E2E)
- Área de chat: Beige oscuro (#C9B99B) 
- Sidebar: Gris cálido (#4A4A4A)
- Acentos: Tonos marrones (#8D6E63, #6D4C41)
- Texto: Beige claro (#F5F5DC)

### 2. Docker ChromaDB Health Check - RESUELTO ✅
**Problema:** ChromaDB fallando health check, contenedor unhealthy
**Causa:** Health check configurado para API v1 deprecada
**Solución:** 
- Actualizado endpoint a /api/v2/heartbeat
- Configurado depends_on con service_started en lugar de service_healthy

### 3. Dockerfile Backend Package-lock - RESUELTO ✅
**Problema:** npm ci fallando por ausencia de package-lock.json
**Causa:** Proyecto con workspaces, npm no genera package-lock individuales
**Solución:** Modificado Dockerfile.backend:
- npm ci → npm install --omit=dev
- npm ci → npm install (para desarrollo)

### 4. Layout y Scroll Issues - RESUELTO ✅
**Problema:** 
- Sin scroll en sidebar de conversaciones
- Altura de pantalla creciendo con conversaciones
- Footer perdido
**Solución:**
- Altura fija para sidebar: calc(100vh - 140px)
- Overflow: auto solo en lista de conversaciones
- Layout contenido en 100vh

### 5. Missing Files - RESUELTOS ✅
**Problema:** Archivos faltantes para Docker build
**Solución:**
- Creado nodemon.json en backend/
- Generadas dependencias npm install

## ESTADO ACTUAL - COMPLETAMENTE FUNCIONAL

### Infraestructura Docker - OPERATIVA ✅
Todos los servicios corriendo correctamente:
- **PostgreSQL**: Healthy, puerto 5433
- **ChromaDB**: Running, puerto 8001, respondiendo API v2
- **Redis**: Healthy, puerto 6380  
- **Backend**: Healthy, puerto 3001, conectado a BD

### Aplicación - FUNCIONAL ✅
- **Frontend**: Corriendo en puerto 3000
- **UI**: Tema oscuro y cálido implementado, perfecto para fotofobia
- **Chat**: Funcional, envía/recibe mensajes con Claude
- **Persistencia**: Conversaciones se guardan en PostgreSQL
- **Claude API**: Funcionando con clave real configurada

### Comandos de Inicio Verificados
```bash
# Docker (infraestructura completa)
docker compose up -d

# Frontend
cd frontend && npm start
```

Estado verificado: TODO FUNCIONANDO CORRECTAMENTE

## FUNCIONALIDADES IMPLEMENTADAS

### ✅ Funcionales
1. **Chat en tiempo real** con Claude Sonnet 4
2. **Gestión de múltiples conversaciones**
3. **Almacenamiento persistente** en PostgreSQL
4. **Interfaz desktop** con Electron
5. **API REST** completa 
6. **Tema oscuro y cálido** para fotofobia
7. **Docker compose** completo con todos los servicios
8. **Sistema RAG** (servicios implementados)
9. **Logging** completo con Winston
10. **Health checks** y monitoreo

### ❌ Pendientes de Integración
1. **RAG no integrado en chat flow** - CRÍTICO
2. **Sin carga de mensajes históricos** al seleccionar conversación
3. **Frontend monolítico** - componentes en una sola archivo
4. **Sistema de proyectos** no implementado en frontend

## PRÓXIMOS DESARROLLOS PRIORITARIOS

### FASE 1: Integración RAG (CRÍTICO)
**Problema:** Los servicios RAG existen pero NO se usan en el chat
**Ubicación:** backend/src/index.ts, endpoint `/api/conversations/:id/messages`
**Solución necesaria:**
1. Modificar endpoint para buscar contexto RAG antes de Claude API
2. Inyectar contexto relevante en prompt a Claude
3. Guardar nuevos contextos en ChromaDB post-respuesta

### FASE 2: Carga de Mensajes Históricos
**Problema:** Frontend no carga mensajes existentes al seleccionar conversación
**Ubicación:** frontend/src/App.js, función setCurrentConversation
**Solución:** Agregar llamada a API para cargar mensajes

### FASE 3: Refactoring Frontend
- Componentizar App.js monolítico
- Separar en componentes especializados
- Implementar sistema de proyectos en UI

### FASE 4: Funcionalidades Avanzadas
- Streaming de respuestas
- Exportación de conversaciones  
- Dashboard de métricas
- Temas personalizables adicionales

## ARCHIVOS CRÍTICOS PARA MODIFICAR

### Para RAG Integration:
- `backend/src/index.ts` - Endpoint de mensajes
- `backend/src/services/rag.service.ts` - Verificar integración
- `backend/src/services/embedding.service.ts` - Verificar funcionamiento

### Para Frontend Improvements:
- `frontend/src/App.js` - Refactoring y carga de mensajes
- Crear: `frontend/src/components/` - Nuevos componentes

## INFORMACIÓN TÉCNICA ADICIONAL

### API Endpoints Existentes
- `GET /api/conversations` - Lista conversaciones
- `POST /api/conversations` - Crear conversación
- `POST /api/conversations/:id/messages` - Enviar mensaje
- `GET /api/health` - Health check backend

### Puertos en Uso
- 3000: Frontend React
- 3001: Backend API  
- 5433: PostgreSQL
- 6380: Redis
- 8001: ChromaDB

### Logs y Debugging
- Logs backend: `./logs/combined.log` y `./logs/error.log`
- Docker logs: `docker compose logs [service]`
- Level configurado: debug

## CONTEXTO DE DESARROLLO

**Usuario Carlos:**
- Fotofóbico - Requiere cuidado especial con colores de UI
- Prefiere explicaciones completas y paso a paso  
- Trabaja en Ubuntu con resolución alta
- Necesita memoria persistente verdadera para trabajo continuo

**Objetivo del Proyecto:**
Claude Infinito v1.1 busca crear un sistema de chat con memoria verdaderamente infinita mediante:
1. Persistencia en base de datos relacional
2. Memoria semántica con RAG y embeddings
3. Interfaz cómoda para uso prolongado
4. Capacidad de retomar trabajo días después sin perder contexto

**Estado Actual:** Infraestructura completa funcional, memoria básica operativa, pendiente integración RAG para memoria semántica avanzada.

---

**NOTA IMPORTANTE:** El sistema está completamente funcional para chat básico con persistencia. La memoria RAG es el siguiente gran paso para memoria semántica verdaderamente infinita.