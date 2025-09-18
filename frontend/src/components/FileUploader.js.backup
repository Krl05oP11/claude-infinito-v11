// frontend/src/components/FileUploader.js

import React, { useState, useRef } from 'react';
import './FileUploader.css';

const FileUploader = ({ projectId, conversationId, onUploadComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const [supportedTypes, setSupportedTypes] = useState([]);
  const fileInputRef = useRef(null);

  // Cargar tipos soportados al montar el componente
  React.useEffect(() => {
    fetch('http://localhost:3001/api/upload/supported-types')
      .then(res => res.json())
      .then(data => setSupportedTypes(data.supportedTypes || []))
      .catch(err => console.error('Error loading supported types:', err));
  }, []);

  // Manejar drag events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Manejar drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Manejar selección de archivos
  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(Array.from(e.target.files));
    }
  };

  // Validar tipo de archivo
  const isFileTypeSupported = (filename) => {
    const extension = '.' + filename.split('.').pop().toLowerCase();
    return supportedTypes.some(type => type.extension === extension);
  };

  // Procesar archivos
  const handleFiles = async (files) => {
    const validFiles = files.filter(file => {
      if (!isFileTypeSupported(file.name)) {
        alert(`Tipo de archivo no soportado: ${file.name}`);
        return false;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert(`Archivo muy grande: ${file.name} (máximo 50MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setUploading(true);
    setUploadResults([]);

    try {
      if (validFiles.length === 1) {
        // Subir archivo individual
        await uploadSingleFile(validFiles[0]);
      } else {
        // Subir múltiples archivos
        await uploadMultipleFiles(validFiles);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error al subir archivos: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Subir archivo individual
  const uploadSingleFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('conversationId', conversationId);

    const response = await fetch('http://localhost:3001/api/upload/file', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    setUploadResults([{
      filename: file.name,
      success: result.success,
      chunksProcessed: result.chunksProcessed,
      fileSize: result.fileSize,
      error: result.error
    }]);

    if (result.success && onUploadComplete) {
      onUploadComplete(result);
    }
  };

  // Subir múltiples archivos
  const uploadMultipleFiles = async (files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('projectId', projectId);
    formData.append('conversationId', conversationId);

    const response = await fetch('/api/upload/files', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    setUploadResults(result.results || []);

    if (result.success && onUploadComplete) {
      onUploadComplete(result);
    }
  };

  return (
    <div className="file-uploader">
      {/* Área de drop */}
      <div 
        className={`drop-zone ${dragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          style={{ display: 'none' }}
          accept={supportedTypes.map(type => type.extension).join(',')}
        />
        
        {uploading ? (
          <div className="uploading-indicator">
            <div className="spinner"></div>
            <p>Procesando archivos...</p>
          </div>
        ) : (
          <div className="drop-content">
            <div className="upload-icon">📄</div>
            <h3>Subir Archivos</h3>
            <p>Arrastra archivos aquí o haz click para seleccionar</p>
            <div className="supported-types">
              <strong>Tipos soportados:</strong>
              <div className="type-list">
                {supportedTypes.slice(0, 8).map(type => (
                  <span key={type.extension} className="file-type">
                    {type.extension}
                  </span>
                ))}
                {supportedTypes.length > 8 && (
                  <span className="more-types">+{supportedTypes.length - 8} más</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resultados de upload */}
      {uploadResults.length > 0 && (
        <div className="upload-results">
          <h4>Resultados del Procesamiento</h4>
          {uploadResults.map((result, index) => (
            <div key={index} className={`result-item ${result.success ? 'success' : 'error'}`}>
              <div className="result-filename">
                {result.success ? '✅' : '❌'} {result.filename}
              </div>
              <div className="result-details">
                {result.success ? (
                  <>
                    <span className="chunks">
                      {result.chunksProcessed} chunks procesados
                    </span>
                    <span className="size">
                      {(result.fileSize / 1024).toFixed(1)} KB
                    </span>
                  </>
                ) : (
                  <span className="error-msg">{result.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Información adicional */}
      <div className="upload-info">
        <div className="info-item">
          <strong>Límites:</strong> Máximo 50MB por archivo, 10 archivos simultáneos
        </div>
        <div className="info-item">
          <strong>Procesamiento:</strong> Los archivos se dividen en chunks semánticos para búsqueda inteligente
        </div>
      </div>
    </div>
  );
};

export default FileUploader;
