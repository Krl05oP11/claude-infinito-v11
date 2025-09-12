import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import FileUploader from './components/FileUploader';

// Photophobic-friendly color palette
const colors = {
  background: '#1a1612',
  surface: '#2d2823',
  surfaceLight: '#3d342c',
  text: '#e8dcc6',
  textSecondary: '#c4b896',
  accent: '#8b6914',
  accentHover: '#a67c00',
  success: '#4a5d23',
  warning: '#8b4513',
  danger: '#722f37',
  border: '#5a4d42'
};

// Prompt templates
const promptTemplates = {
  precise: 'Responde de manera precisa y técnica. Usa terminología específica. Sé conciso pero completo. Si citas fuentes, menciona específicamente de qué archivo proviene la información.',
  balanced: 'Proporciona respuestas balanceadas que combinen precisión técnica con claridad explicativa. Incluye ejemplos cuando sea útil. Si la información proviene de archivos subidos, cita la fuente específica.',
  detailed: 'Proporciona explicaciones detalladas y didácticas. Incluye contexto, ejemplos prácticos y razonamiento paso a paso. Desarrolla los conceptos en profundidad. Cuando uses información de archivos, explica cómo se relaciona con el contexto general.',
  creative: 'Adopta un enfoque creativo y exploratorio. Genera ideas innovadoras, conexiones inesperadas y soluciones originales. Explora múltiples perspectivas y posibilidades. Usa la información de archivos como punto de partida para desarrollar ideas nuevas.'
};

function App() {
  // State management
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Advanced Controls State
  const [temperature, setTemperature] = useState(0.3);
  const [selectedTemplate, setSelectedTemplate] = useState('balanced');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCustomPromptMode, setIsCustomPromptMode] = useState(false);
  
  // System monitoring
  const [systemHealth, setSystemHealth] = useState({ status: 'unknown' });
  const [gpuUsage, setGpuUsage] = useState(75);
  const [backendStatus, setBackendStatus] = useState('healthy');
  const [claudeStatus, setClaudeStatus] = useState('connected');
  
  const messagesEndRef = useRef(null);

  // Effects
  useEffect(() => {
    loadConversations();
    checkSystemHealth();
    const healthInterval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // API Functions
  const checkSystemHealth = async () => {
    try {
      const response = await fetch('/api/health');
      const health = await response.json();
      setSystemHealth(health);
      setBackendStatus('healthy');
      
      // Simulate GPU usage (replace with real monitoring later)
      setGpuUsage(Math.floor(Math.random() * 20) + 70);
    } catch (error) {
      console.error('Health check failed:', error);
      setSystemHealth({ status: 'error', error: error.message });
      setBackendStatus('error');
    }
  };

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      setConversations(data.conversations || []);
      
      if (data.conversations && data.conversations.length > 0 && !currentConversation) {
        selectConversation(data.conversations[0]);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const createNewConversation = async () => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `Nueva conversación ${new Date().toLocaleDateString()}`,
          project_id: crypto.randomUUID()
        })
      });
      
      const newConversation = await response.json();
      setConversations(prev => [newConversation, ...prev]);
      selectConversation(newConversation);
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const selectConversation = async (conversation) => {
    setCurrentConversation(conversation);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/messages`);
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentConversation || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const chatSettings = {
        temperature,
        promptType: isCustomPromptMode ? null : selectedTemplate,
        prompt: isCustomPromptMode ? customPrompt : null
      };

      const response = await fetch(`/api/conversations/${currentConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: userMessage.content,
          settings: chatSettings
        })
      });

      const data = await response.json();
      
      if (data.assistant_message) {
        const assistantMessage = {
          role: 'assistant',
          content: data.assistant_message.content,
          metadata: {
            context_memories_used: data.context_memories_used,
            context_strategy: data.context_strategy,
            settings_applied: data.settings_applied
          }
        };
        setMessages(prev => [...prev, assistantMessage]);
        setClaudeStatus('connected');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error: No se pudo enviar el mensaje. Verifica la conexión.',
        error: true 
      }]);
      setClaudeStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Template selection handler
  const handleTemplateSelect = (template) => {
    if (template === 'custom') {
      setIsCustomPromptMode(true);
    } else {
      setIsCustomPromptMode(false);
      setSelectedTemplate(template);
    }
  };

  // Get current prompt text for display
  const getCurrentPromptDisplay = () => {
    if (isCustomPromptMode) {
      return customPrompt || 'Escriba su prompt personalizado en el área de texto arriba...';
    }
    return promptTemplates[selectedTemplate] || '';
  };

  // Status indicators
  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy':
      case 'connected':
        return colors.success;
      case 'error':
        return colors.danger;
      default:
        return colors.warning;
    }
  };

  const getGpuBarColor = () => {
    if (gpuUsage < 50) return colors.success;
    if (gpuUsage <= 80) return colors.warning;
    return colors.danger;
  };

  return (
    <div 
      className="app-container"
      style={{ 
        backgroundColor: colors.background, 
        color: colors.text,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Main Content Area */}
      <div style={{ 
        display: 'flex', 
        flex: 1,
        minHeight: 0 // Important for flex children with scroll
      }}>
        
        {/* Sidebar */}
        <div 
          className="sidebar"
          style={{
            width: '50%',
            minWidth: '600px',
            backgroundColor: colors.surface,
            borderRight: `1px solid ${colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            overflow: 'auto'
          }}
        >
          {/* Header */}
          <h1 style={{ 
            textAlign: 'center', 
            margin: '0 0 20px 0',
            fontSize: '20px',
            fontWeight: 'bold',
            color: colors.text
          }}>
            Claude Infinito v1.1
          </h1>

          {/* Advanced Controls */}
          <div 
            className="advanced-controls"
            style={{
              backgroundColor: colors.surfaceLight,
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '15px'
            }}
          >
            <h3 style={{ 
              color: colors.textSecondary, 
              fontSize: '16px',
              margin: '0 0 20px 0',
              textAlign: 'center'
            }}>
              Advanced Controls
            </h3>

            {/* Temperature Control */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                color: colors.textSecondary, 
                fontSize: '12px',
                display: 'block',
                marginBottom: '8px'
              }}>
                Temperatura: {temperature}
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  style={{
                    width: '200px',
                    marginRight: '10px',
                    height: '4px',
                    background: colors.border,
                    borderRadius: '2px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ 
                  color: colors.text, 
                  fontSize: '12px',
                  minWidth: '25px'
                }}>
                  {temperature}
                </span>
              </div>
            </div>

            {/* Template Buttons Grid 2x2 */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '10px'
              }}>
                {[
                  { key: 'precise', label: 'Preciso', color: colors.border },
                  { key: 'balanced', label: 'Balanceado', color: colors.accent },
                  { key: 'detailed', label: 'Detallado', color: colors.success },
                  { key: 'creative', label: 'Creativo', color: colors.warning }
                ].map(template => (
                  <button
                    key={template.key}
                    onClick={() => handleTemplateSelect(template.key)}
                    style={{
                      height: '35px',
                      backgroundColor: (!isCustomPromptMode && selectedTemplate === template.key) ? 
                        colors.accentHover : template.color,
                      color: (!isCustomPromptMode && selectedTemplate === template.key) ? 
                        colors.background : colors.text,
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {template.label}
                  </button>
                ))}
              </div>

              {/* Custom Prompt Button */}
              <button
                onClick={() => handleTemplateSelect('custom')}
                style={{
                  width: '100%',
                  height: '30px',
                  backgroundColor: isCustomPromptMode ? colors.accentHover : colors.border,
                  color: isCustomPromptMode ? colors.background : colors.text,
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  marginBottom: '10px'
                }}
              >
                Prompt personalizado...
              </button>

              {/* Custom Prompt Textarea - Always visible when custom mode */}
              {isCustomPromptMode && (
                <div>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Escribe instrucciones específicas para Claude..."
                    style={{
                      width: '100%',
                      height: '80px',
                      backgroundColor: colors.surface,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      padding: '8px',
                      fontSize: '12px',
                      fontStyle: 'italic',
                      resize: 'vertical',
                      fontFamily: 'Inria Serif, serif'
                    }}
                    maxLength={1000}
                  />
                  <div style={{ 
                    fontSize: '10px', 
                    color: colors.textSecondary,
                    textAlign: 'right',
                    marginTop: '5px'
                  }}>
                    {customPrompt.length}/1000 caracteres
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Prompt Display */}
          <div 
            style={{
              backgroundColor: colors.border,
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '15px',
              minHeight: '100px'
            }}
          >
            <h4 style={{ 
              color: colors.textSecondary, 
              fontSize: '14px',
              margin: '0 0 10px 0'
            }}>
              Prompt seleccionado
            </h4>
            <p style={{ 
              fontSize: '12px',
              color: colors.text,
              margin: 0,
              fontStyle: 'italic',
              lineHeight: '1.4',
              wordWrap: 'break-word'
            }}>
              {getCurrentPromptDisplay()}
            </p>
          </div>

          {/* File Uploader */}
          <div style={{ marginBottom: '15px' }}>
            <FileUploader 
              conversationId={currentConversation?.id}
              projectId={currentConversation?.id} 
            />
          </div>

          {/* New Conversation Button */}
          <button
            onClick={createNewConversation}
            style={{
              width: '200px',
              height: '40px',
              backgroundColor: colors.accent,
              color: colors.background,
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              margin: '0 auto 20px auto',
              display: 'block',
              transition: 'all 0.2s'
            }}
          >
            + Nueva Conversación
          </button>

          {/* Conversations List */}
          <div 
            className="conversations-container"
            style={{
              backgroundColor: colors.border,
              borderRadius: '8px',
              padding: '15px',
              flex: 1,
              minHeight: '150px',
              maxHeight: '200px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <h4 style={{ 
              color: colors.textSecondary, 
              fontSize: '14px',
              margin: '0 0 10px 0',
              flexShrink: 0
            }}>
              Conversaciones
            </h4>
            <div 
              className="conversations-list"
              style={{
                flex: 1,
                overflowY: 'auto',
                paddingRight: '5px'
              }}
            >
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  style={{
                    padding: '8px',
                    backgroundColor: currentConversation?.id === conv.id ? 
                      colors.surfaceLight : 'transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginBottom: '5px',
                    fontSize: '12px',
                    color: colors.text,
                    border: `1px solid transparent`,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentConversation?.id !== conv.id) {
                      e.target.style.backgroundColor = colors.surface;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentConversation?.id !== conv.id) {
                      e.target.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  📋 {conv.title}
                </div>
              ))}
              {conversations.length === 0 && (
                <div style={{ 
                  color: colors.textSecondary, 
                  fontSize: '12px',
                  fontStyle: 'italic',
                  textAlign: 'center'
                }}>
                  No hay conversaciones
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div 
          className="main-area"
          style={{
            width: '50%',
            minWidth: '600px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Chat Header */}
          <div 
            style={{
              backgroundColor: colors.surface,
              padding: '20px',
              borderBottom: `1px solid ${colors.border}`,
              textAlign: 'center',
              flexShrink: 0
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
              {currentConversation ? currentConversation.title : 'Conversación Actual'}
            </h2>
          </div>

          {/* Messages Area */}
          <div 
            className="messages-area"
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              padding: '20px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
              minHeight: 0
            }}
          >
            {messages.length === 0 ? (
              <div style={{ 
                textAlign: 'left', 
                color: colors.textSecondary,
                fontSize: '14px',
                fontStyle: 'italic',
                lineHeight: '1.6'
              }}>
                <p><strong>Usuario:</strong> ¿Qué dice el archivo sobre clustering?</p>
                <p><strong>Claude:</strong> Según el contenido del archivo...</p>
                <p><strong>Usuario:</strong> ¿Y sobre Elbow Method?</p>
                <p><strong>Claude:</strong> Revisando el archivo, no encuentro...</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  style={{
                    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: message.role === 'user' ? 
                      colors.accent : colors.surfaceLight,
                    color: message.role === 'user' ? 
                      colors.background : colors.text,
                    wordWrap: 'break-word',
                    lineHeight: '1.4'
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {message.role === 'user' ? 'Usuario' : 'Claude'}:
                  </div>
                  <div>{message.content}</div>
                  {message.metadata && (
                    <div style={{
                      fontSize: '10px',
                      marginTop: '8px',
                      opacity: 0.7,
                      borderTop: `1px solid ${message.role === 'user' ? colors.background : colors.border}`,
                      paddingTop: '4px'
                    }}>
                      Contexto: {message.metadata.context_memories_used || 0} memorias
                      {message.metadata.context_strategy && 
                        ` (${message.metadata.context_strategy})`}
                    </div>
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '12px 16px',
                backgroundColor: colors.surfaceLight,
                borderRadius: '12px',
                color: colors.textSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div className="loading-dots">●</div>
                <div className="loading-dots" style={{ animationDelay: '0.2s' }}>●</div>
                <div className="loading-dots" style={{ animationDelay: '0.4s' }}>●</div>
                Claude está pensando...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div 
            className="input-area"
            style={{
              backgroundColor: colors.surface,
              padding: '20px',
              borderTop: `1px solid ${colors.border}`,
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
                disabled={isLoading}
                style={{
                  width: '100%',
                  height: '80px',
                  backgroundColor: colors.background,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '12px',
                  color: colors.text,
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                style={{
                  alignSelf: 'flex-end',
                  width: '100px',
                  height: '40px',
                  backgroundColor: colors.accent,
                  color: colors.background,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: (!input.trim() || isLoading) ? 0.5 : 1
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div 
        className="footer"
        style={{
          height: '40px',
          backgroundColor: colors.surface,
          borderTop: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '20px',
          paddingRight: '20px',
          gap: '30px',
          fontSize: '12px',
          color: colors.textSecondary,
          flexShrink: 0
        }}
      >
        {/* GPU Monitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>GPU:</span>
          <div style={{ 
            width: '100px', 
            height: '8px', 
            backgroundColor: colors.border,
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${gpuUsage}%`,
              height: '100%',
              backgroundColor: getGpuBarColor(),
              borderRadius: '4px',
              transition: 'width 0.3s ease'
            }}></div>
          </div>
          <span style={{ minWidth: '30px' }}>{gpuUsage}%</span>
        </div>

        {/* Backend Monitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Backend:</span>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(backendStatus),
            animation: backendStatus === 'error' ? 'pulse 1s infinite' : 'none'
          }}></div>
          <span style={{ color: getStatusColor(backendStatus) }}>
            {backendStatus === 'healthy' ? 'Healthy' : 'Error'}
          </span>
        </div>

        {/* Claude Monitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Claude:</span>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(claudeStatus),
            animation: claudeStatus === 'error' ? 'pulse 1s infinite' : 'none'
          }}></div>
          <span style={{ color: getStatusColor(claudeStatus) }}>
            {claudeStatus === 'connected' ? 'Connected' : 'Error'}
          </span>
        </div>

        <span>RTX Active</span>
      </div>
    </div>
  );
}

export default App;

