import React, { useState, useEffect } from 'react';

const KnowledgeBaseViewer = ({ projectId, colors, onDocumentDeleted }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cargar documentos cuando se expande o cambia el proyecto
  useEffect(() => {
    if (isExpanded && projectId) {
      fetchDocuments();
    }
  }, [isExpanded, projectId]);

  const fetchDocuments = async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('No se pudieron cargar los documentos');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId, filename) => {
    if (!window.confirm(`¿Estás seguro de eliminar "${filename}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      // Actualizar lista local
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      // Notificar al componente padre si hay callback
      if (onDocumentDeleted) {
        onDocumentDeleted(documentId);
      }

      console.log(`✅ Documento eliminado: ${filename}`);
    } catch (err) {
      console.error('Error deleting document:', err);
      alert('Error al eliminar el documento');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    if (kb >= 1) return `${kb.toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileType) => {
    if (!fileType) return '📄';
    
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return '📕';
    if (type.includes('text') || type.includes('txt')) return '📝';
    if (type.includes('markdown') || type.includes('md')) return '📘';
    if (type.includes('json')) return '📊';
    if (type.includes('image')) return '🖼️';
    
    return '📄';
  };

  return (
    <div 
      className="knowledge-base-viewer"
      style={{
        backgroundColor: colors.border,
        borderRadius: '8px',
        padding: '15px',
        marginBottom: '15px'
      }}
    >
      {/* Header con toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <h4 style={{ 
          color: colors.textSecondary, 
          fontSize: '14px',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          📚 Knowledge Base
          {documents.length > 0 && (
            <span style={{
              fontSize: '11px',
              backgroundColor: colors.accent,
              color: colors.background,
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 'bold'
            }}>
              {documents.length}
            </span>
          )}
        </h4>
        <span style={{ 
          color: colors.textSecondary,
          fontSize: '16px',
          transition: 'transform 0.2s',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
        }}>
          ▼
        </span>
      </div>

      {/* Lista de documentos (colapsable) */}
      {isExpanded && (
        <div 
          style={{
            marginTop: '12px',
            maxHeight: '200px',
            overflowY: 'auto',
            borderTop: `1px solid ${colors.border}`
          }}
        >
          {loading ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: colors.textSecondary,
              fontSize: '12px',
              fontStyle: 'italic'
            }}>
              Cargando documentos...
            </div>
          ) : error ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: '#d32f2f',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: 'rgba(211, 47, 47, 0.1)',
              borderRadius: '4px',
              border: '1px solid rgba(211, 47, 47, 0.3)'
            }}>
              {error}
            </div>
          ) : documents.length === 0 ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: colors.textSecondary,
              fontSize: '12px',
              fontStyle: 'italic'
            }}>
              No hay documentos en la Knowledge Base
            </div>
          ) : (
            <div style={{ paddingTop: '8px' }}>
              {documents.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    padding: '10px',
                    marginBottom: '6px',
                    backgroundColor: colors.surface,
                    borderRadius: '4px',
                    border: `1px solid ${colors.border}`,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.surfaceLight;
                    e.currentTarget.style.borderColor = colors.accent;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = colors.surface;
                    e.currentTarget.style.borderColor = colors.border;
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '4px'
                      }}>
                        <span style={{ fontSize: '14px' }}>
                          {getFileIcon(doc.fileType)}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          color: colors.text,
                          fontWeight: 'bold',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {doc.filename}
                        </span>
                      </div>
                      
                      <div style={{
                        fontSize: '10px',
                        color: colors.textSecondary,
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap'
                      }}>
                        <span>📦 {formatFileSize(doc.fileSize)}</span>
                        <span>🧩 {doc.chunkCount} chunks</span>
                        <span>📅 {formatDate(doc.uploadDate)}</span>
                      </div>

                      {doc.processed && (
                        <div style={{
                          marginTop: '4px',
                          fontSize: '9px',
                          color: colors.success,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span>✓</span>
                          <span>Procesado</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id, doc.filename);
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        padding: 0,
                        backgroundColor: 'transparent',
                        border: `1px solid ${colors.danger}`,
                        borderRadius: '4px',
                        color: colors.danger,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = colors.danger;
                        e.currentTarget.style.color = colors.background;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = colors.danger;
                      }}
                      title="Eliminar documento"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseViewer;
