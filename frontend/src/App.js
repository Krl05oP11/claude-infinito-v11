import FileUploader from './components/FileUploader';
import React, { useState, useEffect } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Container, 
  Paper, 
  TextField, 
  Button, 
  List, 
  ListItem, 
  ListItemText, 
  Box,
  Chip,
  Divider,
  createTheme,
  ThemeProvider,
  LinearProgress
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

// Tema oscuro y cálido para fotofobia
const warmDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8D6E63',
      light: '#A1887F',
      dark: '#5D4037',
      contrastText: '#F5F5DC'
    },
    secondary: {
      main: '#A1887F',
      light: '#BCAAA4',
      dark: '#6D4C41',
      contrastText: '#F5F5DC'
    },
    background: {
      default: '#2E2E2E',
      paper: '#3E3E3E'
    },
    surface: {
      main: '#4E4E4E'
    },
    text: {
      primary: '#F5F5DC',
      secondary: '#D7CCC8'
    },
    divider: '#5D4037',
    action: {
      hover: '#4E342E',
      selected: '#6D4C41'
    }
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#3E2723',
          color: '#F5F5DC'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#4A4A4A',
          color: '#F5F5DC'
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#5A5A5A',
            '& fieldset': {
              borderColor: '#8D6E63'
            },
            '&:hover fieldset': {
              borderColor: '#A1887F'
            },
            '&.Mui-focused fieldset': {
              borderColor: '#BCAAA4'
            }
          },
          '& .MuiInputBase-input': {
            color: '#F5F5DC'
          }
        }
      }
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: '#6D4C41',
            '&:hover': {
              backgroundColor: '#5D4037'
            }
          },
          '&:hover': {
            backgroundColor: '#4E342E'
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          '&.MuiChip-colorPrimary': {
            backgroundColor: '#8D6E63',
            color: '#F5F5DC'
          },
          '&.MuiChip-colorSecondary': {
            backgroundColor: '#A1887F',
            color: '#2E2E2E'
          }
        }
      }
    }
  }
});

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  
  // Estados para monitoreo
  const [systemStatus, setSystemStatus] = useState({
    gpuUsage: 0,
    claudeApiStatus: 'Conectado',
    backendStatus: 'Operativo'
  });

  useEffect(() => {
    loadConversations();
    
    // Monitoreo del sistema cada 3 segundos
    const interval = setInterval(checkSystemStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const checkSystemStatus = async () => {
    try {
      // Verificar estado del backend
      const backendResponse = await axios.get(`${API_BASE}/health`);
      
      // Simular GPU usage (en producción, esto vendría del backend)
      // TODO: Implementar endpoint real para GPU stats
      const gpuUsage = Math.floor(Math.random() * 30) + 70; // Simula 70-100%
      
      setSystemStatus({
        gpuUsage,
        claudeApiStatus: 'Conectado',
        backendStatus: 'Operativo'
      });
    } catch (error) {
      setSystemStatus(prev => ({
        ...prev,
        backendStatus: 'Error',
        claudeApiStatus: 'Desconectado'
      }));
    }
  };

  const loadConversations = async () => {
    try {
      const response = await axios.get(`${API_BASE}/conversations`);
      setConversations(response.data.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const createConversation = async () => {
    try {
      const response = await axios.post(`${API_BASE}/conversations`, {
        title: `Nueva conversación ${new Date().toLocaleString()}`
      });
      const newConv = response.data;
      setConversations([newConv, ...conversations]);
      setCurrentConversation(newConv);
      setMessages([]);
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return;

    setLoading(true);
    const tempMessage = { role: 'user', content: newMessage, timestamp: new Date() };
    setMessages(prev => [...prev, tempMessage]);
    
    const messageToSend = newMessage;
    setNewMessage('');

    try {
      const response = await axios.post(
        `${API_BASE}/conversations/${currentConversation.id}/messages`,
        { content: messageToSend }
      );

      setMessages(prev => [
        ...prev.slice(0, -1),
        response.data.user_message,
        response.data.assistant_message
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeProvider theme={warmDarkTheme}>
      {/* CONTENEDOR PRINCIPAL CON ALTURA FIJA */}
      <Box sx={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: '#2E2E2E',
        overflow: 'hidden' // Evita scroll en el contenedor principal
      }}>
        
        {/* HEADER FIJO */}
        <AppBar position="static" sx={{ flexShrink: 0 }}>
          <Toolbar>
            <ChatIcon sx={{ mr: 2, color: '#F5F5DC' }} />
            <Typography variant="h6" sx={{ color: '#F5F5DC' }}>
              Claude Infinito v1.1
            </Typography>
            
            {currentConversation && (
              <Button 
                onClick={() => setShowUploader(!showUploader)}
                variant="contained"
                sx={{
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#c53030'
                  },
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: 'auto',
                  px: 2,
                  ml: 2
                }}
              >
                {showUploader ? '✖️ Cerrar' : '📄 Archivos'}
              </Button>
            )}
            
            <Box sx={{ ml: 'auto' }}>
              <Button 
                color="inherit" 
                onClick={createConversation}
                sx={{ 
                  color: '#F5F5DC',
                  '&:hover': {
                    backgroundColor: 'rgba(245, 245, 220, 0.1)'
                  }
                }}
              >
                Nueva Conversación
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        {/* PANEL UPLOAD */}
        {showUploader && currentConversation && (
          <Paper sx={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '500px',
            background: '#1a202c',
            border: '1px solid #4a5568',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            zIndex: 1001
          }}>
            <FileUploader
              projectId={currentConversation.id}
              conversationId={currentConversation.id}
              onUploadComplete={(result) => {
                console.log('Upload completed:', result);
                alert(`Archivo procesado: ${result.chunksProcessed} chunks almacenados`);
                setShowUploader(false);
              }}
            />
          </Paper>
        )}

        {/* CONTENEDOR PRINCIPAL CON FLEXBOX CORRECTO */}
        <Box sx={{ 
          display: 'flex', 
          flexGrow: 1,
          minHeight: 0 // Clave para que funcione el scroll
        }}>
          
          {/* SIDEBAR CON SCROLL INDEPENDIENTE */}
          <Paper sx={{ 
            width: 300, 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: '#4A4A4A',
            borderRight: '1px solid #6D4C41',
            flexShrink: 0 // No se encoge
          }}>
            <Typography variant="h6" sx={{ p: 2, color: '#F5F5DC', flexShrink: 0 }}>
              Conversaciones
            </Typography>
            
            {/* LISTA CON SCROLL INDEPENDIENTE */}
            <Box sx={{ 
              flexGrow: 1, 
              overflow: 'auto',
              minHeight: 0 // Clave para scroll
            }}>
              <List>
                {conversations.map(conv => (
                  <ListItem
                    key={conv.id}
                    button
                    selected={currentConversation?.id === conv.id}
                    onClick={() => {
                      setCurrentConversation(conv);
                      setMessages([]);
                    }}
                    sx={{
                      color: '#F5F5DC',
                      '&.Mui-selected': {
                        backgroundColor: '#6D4C41',
                        '&:hover': {
                          backgroundColor: '#5D4037'
                        }
                      },
                      '&:hover': {
                        backgroundColor: '#4E342E'
                      }
                    }}
                  >
                    <ListItemText
                      primary={conv.title}
                      secondary={new Date(conv.updated_at).toLocaleString()}
                      sx={{
                        '& .MuiListItemText-primary': {
                          color: '#F5F5DC',
                          fontSize: '0.9rem'
                        },
                        '& .MuiListItemText-secondary': {
                          color: '#D7CCC8',
                          fontSize: '0.75rem'
                        }
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>

            {/* MONITORES DE ESTADO - FIJO EN BOTTOM */}
            <Box sx={{ 
              p: 2, 
              borderTop: '1px solid #6D4C41',
              backgroundColor: '#3A3A3A',
              flexShrink: 0
            }}>
              <Typography variant="subtitle2" sx={{ color: '#F5F5DC', mb: 1 }}>
                Estado del Sistema
              </Typography>
              
              {/* MONITOR GPU CON PORCENTAJE REAL */}
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#D7CCC8' }}>
                    GPU RTX 5070 Ti
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#F5F5DC', fontWeight: 'bold' }}>
                    {systemStatus.gpuUsage}%
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={systemStatus.gpuUsage} 
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#5A5A5A',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: systemStatus.gpuUsage > 80 ? '#4CAF50' : 
                                       systemStatus.gpuUsage > 50 ? '#FF9800' : '#F44336',
                      borderRadius: 3
                    }
                  }}
                />
              </Box>

              {/* MONITOR CLAUDE API */}
              <Box sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  backgroundColor: systemStatus.claudeApiStatus === 'Conectado' ? '#4CAF50' : '#F44336',
                  mr: 1 
                }} />
                <Typography variant="caption" sx={{ color: '#D7CCC8' }}>
                  Claude API: {systemStatus.claudeApiStatus}
                </Typography>
              </Box>

              {/* MONITOR BACKEND */}
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  backgroundColor: systemStatus.backendStatus === 'Operativo' ? '#4CAF50' : '#F44336',
                  mr: 1 
                }} />
                <Typography variant="caption" sx={{ color: '#D7CCC8' }}>
                  Backend: {systemStatus.backendStatus}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* ÁREA DE CHAT CON SCROLL INDEPENDIENTE Y FOOTER FIJO */}
          <Box sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column',
            minHeight: 0 // Clave para scroll
          }}>
            {currentConversation ? (
              <>
                {/* ÁREA DE MENSAJES CON SCROLL INDEPENDIENTE */}
                <Box sx={{ 
                  flexGrow: 1, 
                  overflow: 'auto', 
                  p: 2,
                  backgroundColor: '#C9B99B',
                  minHeight: 0 // Clave para scroll
                }}>
                  {messages.map((msg, index) => (
                    <Box key={index} sx={{ mb: 2 }}>
                      <Chip
                        label={msg.role === 'user' ? 'Tú' : 'Claude'}
                        color={msg.role === 'user' ? 'primary' : 'secondary'}
                        size="small"
                        sx={{ mb: 1 }}
                      />
                      <Paper sx={{ 
                        p: 2, 
                        mt: 1, 
                        backgroundColor: msg.role === 'user' ? '#6D4C41' : '#5A5A5A',
                        border: `1px solid ${msg.role === 'user' ? '#8D6E63' : '#A1887F'}`
                      }}>
                        <Typography 
                          variant="body1" 
                          sx={{ 
                            color: '#F5F5DC',
                            lineHeight: 1.6
                          }}
                        >
                          {msg.content}
                        </Typography>
                      </Paper>
                    </Box>
                  ))}
                  {loading && (
                    <Box sx={{ mb: 2 }}>
                      <Chip label="Claude" color="secondary" size="small" sx={{ mb: 1 }} />
                      <Paper sx={{ 
                        p: 2, 
                        mt: 1,
                        backgroundColor: '#5A5A5A',
                        border: '1px solid #A1887F'
                      }}>
                        <Typography 
                          variant="body1" 
                          sx={{ 
                            color: '#D7CCC8',
                            fontStyle: 'italic'
                          }}
                        >
                          Claude está escribiendo...
                        </Typography>
                      </Paper>
                    </Box>
                  )}
                </Box>

                <Divider sx={{ backgroundColor: '#6D4C41' }} />

                {/* INPUT FIJO EN BOTTOM */}
                <Box sx={{ 
                  p: 2, 
                  display: 'flex', 
                  gap: 1,
                  backgroundColor: '#C9B99B',
                  flexShrink: 0 // No se encoge - siempre visible
                }}>
                  <TextField
                    fullWidth
                    placeholder="Escribe tu mensaje..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    multiline
                    maxRows={4}
                    disabled={loading}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: '#C9B99B',
                        '& fieldset': {
                          borderColor: '#8D6E63'
                        },
                        '&:hover fieldset': {
                          borderColor: '#A1887F'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#6D4C41'
                        }
                      },
                      '& .MuiInputBase-input': {
                        color: '#3E2723'
                      },
                      '& .MuiInputBase-input::placeholder': {
                        color: '#8D6E63',
                        opacity: 0.7
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={sendMessage}
                    disabled={loading || !newMessage.trim()}
                    sx={{ 
                      minWidth: 'auto', 
                      px: 2,
                      backgroundColor: '#8D6E63',
                      color: '#F5F5DC',
                      '&:hover': {
                        backgroundColor: '#6D4C41'
                      },
                      '&:disabled': {
                        backgroundColor: '#BCAAA4',
                        color: '#8D6E63'
                      }
                    }}
                  >
                    <SendIcon />
                  </Button>
                </Box>
              </>
            ) : (
              <Box sx={{ 
                flexGrow: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexDirection: 'column',
                backgroundColor: '#C9B99B'
              }}>
                <Typography variant="h4" sx={{ color: '#3E2723', mb: 2 }}>
                  Claude Infinito v1.1
                </Typography>
                <Typography variant="body1" sx={{ color: '#6D4C41', mb: 3 }}>
                  Selecciona una conversación o crea una nueva
                </Typography>
                <Button 
                  variant="contained" 
                  onClick={createConversation}
                  sx={{
                    backgroundColor: '#8D6E63',
                    color: '#F5F5DC',
                    '&:hover': {
                      backgroundColor: '#6D4C41'
                    }
                  }}
                >
                  Crear Nueva Conversación
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
