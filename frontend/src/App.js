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
  ThemeProvider
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
      main: '#8D6E63', // Marrón cálido
      light: '#A1887F',
      dark: '#5D4037',
      contrastText: '#F5F5DC' // Beige claro
    },
    secondary: {
      main: '#A1887F', // Marrón gris
      light: '#BCAAA4',
      dark: '#6D4C41',
      contrastText: '#F5F5DC'
    },
    background: {
      default: '#2E2E2E', // Gris oscuro cálido
      paper: '#3E3E3E'     // Gris medio
    },
    surface: {
      main: '#4E4E4E'      // Gris claro
    },
    text: {
      primary: '#F5F5DC',   // Beige claro
      secondary: '#D7CCC8'  // Beige grisáceo
    },
    divider: '#5D4037',     // Marrón oscuro
    action: {
      hover: '#4E342E',     // Marrón muy oscuro
      selected: '#6D4C41'   // Marrón oscuro
    }
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#3E2723', // Marrón muy oscuro
          color: '#F5F5DC'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#4A4A4A', // Gris cálido
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

  useEffect(() => {
    loadConversations();
  }, []);

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
      <Box sx={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: '#2E2E2E' // Fondo principal oscuro y cálido
      }}>
        <AppBar position="static">
          <Toolbar>
            <ChatIcon sx={{ mr: 2, color: '#F5F5DC' }} />
            <Typography variant="h6" sx={{ color: '#F5F5DC' }}>
              Claude Infinito v1.1
            </Typography>
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

        <Box sx={{ display: 'flex', flexGrow: 1 }}>
          {/* Sidebar con scroll arreglado */}
          <Paper sx={{ 
            width: 300, 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: '#4A4A4A',
            borderRight: '1px solid #6D4C41'
          }}>
            <Typography variant="h6" sx={{ p: 2, color: '#F5F5DC' }}>
              Conversaciones
            </Typography>
            <List sx={{ 
              flexGrow: 1, 
              overflow: 'auto',
              maxHeight: 'calc(100vh - 140px)' // Altura fija para scroll
            }}>
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
                        color: '#F5F5DC'
                      },
                      '& .MuiListItemText-secondary': {
                        color: '#D7CCC8'
                      }
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>

          {/* Chat Area con fondo uniforme */}
          <Box sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column'
          }}>
            {currentConversation ? (
              <>
                {/* Messages con fondo oscuro uniforme */}
                <Box sx={{ 
                  flexGrow: 1, 
                  overflow: 'auto', 
                  p: 2,
                  backgroundColor: '#C9B99B' // FONDO UNIFORME BEIGE OSCURO
                }}>
                  {messages.map((msg, index) => (
                    <Box key={index} sx={{ mb: 2 }}>
                      <Chip
                        label={msg.role === 'user' ? 'Tú' : 'Claude'}
                        color={msg.role === 'user' ? 'primary' : 'secondary'}
                        size="small"
                        sx={{
                          mb: 1,
                          '&.MuiChip-colorPrimary': {
                            backgroundColor: '#8D6E63',
                            color: '#F5F5DC'
                          },
                          '&.MuiChip-colorSecondary': {
                            backgroundColor: '#A1887F',
                            color: '#2E2E2E'
                          }
                        }}
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
                      <Chip 
                        label="Claude" 
                        color="secondary" 
                        size="small"
                        sx={{ mb: 1 }}
                      />
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

                {/* Input con fondo que coincide */}
                <Box sx={{ 
                  p: 2, 
                  display: 'flex', 
                  gap: 1,
                  backgroundColor: '#C9B99B' // MISMO COLOR QUE ÁREA DE MENSAJES
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
                        backgroundColor: '#C9B99B', // MISMO COLOR
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
                backgroundColor: '#C9B99B' // Mismo color beige oscuro
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
