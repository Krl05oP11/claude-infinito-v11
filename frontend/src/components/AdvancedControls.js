import React, { useState, useEffect } from 'react';

const AdvancedControls = ({ onSettingsChange, className = '' }) => {
  const [temperature, setTemperature] = useState(0.3);
  const [selectedPrompt, setSelectedPrompt] = useState('balanced');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState({});

  // Fotophobic-friendly color palette - warm browns and beiges
  const colors = {
    background: '#2d2823',      // Dark warm brown
    surface: '#3d342c',         // Medium brown
    surfaceLight: '#4a4037',    // Lighter brown
    text: '#e8dcc6',           // Warm cream
    textSecondary: '#c4b896',   // Muted cream
    accent: '#8b6914',         // Warm gold
    accentHover: '#a67c00',    // Brighter gold
    success: '#4a5d23',        // Warm green
    warning: '#8b4513',        // Saddle brown
    danger: '#722f37',         // Deep burgundy
    border: '#5a4d42'          // Brown border
  };

  // Predefined prompt templates (will be loaded from backend)
  const [promptTemplates, setPromptTemplates] = useState({
    'precise': {
      name: 'Preciso y Técnico',
      description: 'Respuestas exactas, técnicas y concisas',
      icon: '🎯',
      recommended_temp: 0.2,
      color: colors.accent
    },
    'balanced': {
      name: 'Balanceado',
      description: 'Respuestas equilibradas entre detalle y claridad',
      icon: '⚖️',
      recommended_temp: 0.4,
      color: colors.success
    },
    'detailed': {
      name: 'Detallado y Didáctico',
      description: 'Explicaciones profundas y educativas',
      icon: '📚',
      recommended_temp: 0.5,
      color: colors.warning
    },
    'creative': {
      name: 'Creativo y Exploratorio',
      description: 'Enfoque innovador y generación de ideas',
      icon: '💡',
      recommended_temp: 0.7,
      color: colors.danger
    }
  });

  // Temperature presets with photophobic-friendly descriptions
  const temperaturePresets = [
    { value: 0.1, label: 'Muy Preciso', description: 'Respuestas muy consistentes y factuales', color: colors.accent },
    { value: 0.3, label: 'Preciso', description: 'Buena precisión con algo de variación', color: colors.success },
    { value: 0.5, label: 'Balanceado', description: 'Equilibrio entre precisión y creatividad', color: colors.warning },
    { value: 0.7, label: 'Creativo', description: 'Más variación y enfoques creativos', color: colors.danger },
    { value: 0.9, label: 'Muy Creativo', description: 'Máxima creatividad y exploración', color: colors.textSecondary }
  ];

  // Load templates from backend on component mount
  useEffect(() => {
    const loadBackendConfig = async () => {
      try {
        const response = await fetch('/api/claude/config');
        const config = await response.json();
        
        if (config.templates) {
          setAvailableTemplates(config.templates);
          
          // Update prompt templates with backend data
          const updatedTemplates = { ...promptTemplates };
          Object.keys(config.templates).forEach(key => {
            if (updatedTemplates[key]) {
              updatedTemplates[key] = {
                ...updatedTemplates[key],
                ...config.templates[key]
              };
            }
          });
          setPromptTemplates(updatedTemplates);
        }
        
        // Set defaults from backend
        if (config.defaults) {
          setTemperature(config.defaults.temperature || 0.3);
          setSelectedPrompt(config.defaults.promptType || 'balanced');
        }
      } catch (error) {
        console.error('Error loading backend config:', error);
      }
    };

    loadBackendConfig();
  }, []);

  useEffect(() => {
    // When prompt template changes, update recommended temperature
    if (selectedPrompt !== 'custom' && promptTemplates[selectedPrompt]) {
      const newTemp = promptTemplates[selectedPrompt].recommended_temp;
      if (newTemp) {
        setTemperature(newTemp);
      }
    }
  }, [selectedPrompt, promptTemplates]);

  useEffect(() => {
    // Notify parent component of changes
    const currentPrompt = selectedPrompt === 'custom' 
      ? customPrompt 
      : availableTemplates[selectedPrompt]?.template || '';
      
    onSettingsChange({
      temperature,
      prompt: currentPrompt,
      promptType: selectedPrompt
    });
  }, [temperature, selectedPrompt, customPrompt, availableTemplates]); // FIXED: Removed onSettingsChange from dependencies

  const getTemperatureColor = (temp) => {
    if (temp <= 0.3) return colors.accent;
    if (temp <= 0.5) return colors.success;
    if (temp <= 0.7) return colors.warning;
    return colors.danger;
  };

  const getTemperatureLabel = (temp) => {
    const preset = temperaturePresets.find(p => Math.abs(p.value - temp) < 0.05);
    return preset ? preset.label : temp.toFixed(1);
  };

  const handleQuickPreset = (promptType, temp) => {
    setIsLoading(true);
    setSelectedPrompt(promptType);
    setTemperature(temp);
    setTimeout(() => setIsLoading(false), 300); // Visual feedback
  };

  return (
    <div 
      className={`p-4 transition-all duration-300 ${className}`}
      style={{ 
        backgroundColor: colors.background,
        color: colors.text
      }}
    >
      {/* Header with prominent toggle button */}
      <div className="flex justify-center mb-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 flex items-center space-x-2"
          style={{ 
            backgroundColor: colors.accent,
            color: colors.background,
            border: 'none'
          }}
        >
          <span>⚙️</span>
          <span>Configuración Avanzada</span>
          <span className="text-sm">
            {showAdvanced ? '▼' : '▶'}
          </span>
        </button>
      </div>

      {showAdvanced && (
        <div className="space-y-6 animate-fade-in">
          {/* Temperature Control - CENTERED */}
          <div className="flex flex-col items-center space-y-3">
            <div className="text-center">
              <label className="font-medium text-sm block mb-1">
                🌡️ Temperatura: <span 
                  className="font-bold"
                  style={{ color: getTemperatureColor(temperature) }}
                >
                  {getTemperatureLabel(temperature)}
                </span>
              </label>
            </div>
            
            <div className="relative w-64">
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-3 rounded-lg appearance-none cursor-pointer transition-all duration-200"
                style={{ 
                  background: `linear-gradient(to right, ${colors.accent} 0%, ${colors.warning} 50%, ${colors.danger} 100%)`,
                  outline: 'none'
                }}
              />
              <div 
                className="absolute top-0 w-4 h-3 rounded-full border-2 pointer-events-none transition-all duration-200"
                style={{ 
                  left: `calc(${((temperature - 0.1) / 0.9) * 100}% - 8px)`,
                  backgroundColor: getTemperatureColor(temperature),
                  borderColor: colors.background,
                  boxShadow: `0 0 10px ${getTemperatureColor(temperature)}50`
                }}
              />
            </div>
            
            <div className="flex justify-between w-64 text-xs" style={{ color: colors.textSecondary }}>
              <span>Preciso</span>
              <span>Creativo</span>
            </div>
            
            {/* Temperature description - CENTERED */}
            <p className="text-xs text-center max-w-xs" style={{ color: colors.textSecondary }}>
              {temperaturePresets.find(p => Math.abs(p.value - temperature) < 0.05)?.description || 
               'Personalizado: Ajusta la aleatoriedad de las respuestas'}
            </p>
          </div>

          {/* Prompt Template Selection - CENTERED 2x2 MATRIX */}
          <div className="flex flex-col items-center space-y-4">
            <label className="font-medium text-sm">
              📝 Estilo de Respuesta
            </label>
            
            {/* 2x2 Matrix for main templates */}
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {Object.entries(promptTemplates).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => setSelectedPrompt(key)}
                  className={`p-3 rounded-lg text-center text-sm font-medium transition-all duration-200 hover:scale-105 ${
                    selectedPrompt === key ? 'ring-2' : 'hover:opacity-80'
                  }`}
                  style={{ 
                    backgroundColor: selectedPrompt === key ? colors.surface : colors.surfaceLight,
                    border: `1px solid ${selectedPrompt === key ? template.color : colors.border}`,
                    ringColor: template.color,
                    minHeight: '80px'
                  }}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-lg">{template.icon}</span>
                    <span className="font-semibold text-xs">{template.name}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom option - SEPARATE BELOW MATRIX */}
            <button
              onClick={() => setSelectedPrompt('custom')}
              className={`p-3 rounded-lg text-center text-sm font-medium transition-all duration-200 hover:scale-105 max-w-md w-full ${
                selectedPrompt === 'custom' ? 'ring-2' : 'hover:opacity-80'
              }`}
              style={{ 
                backgroundColor: selectedPrompt === 'custom' ? colors.surface : colors.surfaceLight,
                border: `1px solid ${selectedPrompt === 'custom' ? colors.textSecondary : colors.border}`,
                ringColor: colors.textSecondary
              }}
            >
              <div className="flex items-center justify-center space-x-2">
                <span>✏️</span>
                <span className="font-semibold">Personalizado</span>
              </div>
            </button>
          </div>

          {/* Custom Prompt Input - CENTERED */}
          {selectedPrompt === 'custom' && (
            <div className="flex flex-col items-center space-y-2">
              <label className="font-medium text-sm">
                ✏️ Prompt Personalizado
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Escribe aquí cómo quieres que Claude responda..."
                rows={4}
                className="w-full max-w-md p-3 rounded-lg text-sm resize-none transition-all duration-200 focus:ring-2 focus:outline-none"
                style={{ 
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  color: colors.text,
                  ringColor: colors.accent
                }}
              />
            </div>
          )}

          {/* Current Prompt Preview - WIDER AND CENTERED */}
          {selectedPrompt !== 'custom' && availableTemplates[selectedPrompt] && (
            <div className="flex flex-col items-center space-y-2">
              <label className="font-medium text-sm">
                👀 Vista Previa del Prompt
              </label>
              <div 
                className="p-3 rounded-lg text-sm leading-relaxed w-80 text-center"
                style={{ 
                  backgroundColor: colors.surface,
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`
                }}
              >
                {availableTemplates[selectedPrompt].template}
              </div>
            </div>
          )}

          {/* Quick Presets - PROPERLY CENTERED IN ONE ROW */}
          <div className="flex flex-col items-center space-y-3">
            <label className="font-medium text-sm">
              🚀 Configuraciones Rápidas
            </label>
            <div className="flex justify-center space-x-3 w-full">
              <button
                onClick={() => handleQuickPreset('precise', 0.2)}
                disabled={isLoading}
                className="px-3 py-2 text-xs rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50"
                style={{ 
                  backgroundColor: colors.accent,
                  color: colors.background
                }}
              >
                📊 Técnico
              </button>
              <button
                onClick={() => handleQuickPreset('detailed', 0.5)}
                disabled={isLoading}
                className="px-3 py-2 text-xs rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50"
                style={{ 
                  backgroundColor: colors.success,
                  color: colors.background
                }}
              >
                📚 Didáctico
              </button>
              <button
                onClick={() => handleQuickPreset('creative', 0.7)}
                disabled={isLoading}
                className="px-3 py-2 text-xs rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50"
                style={{ 
                  backgroundColor: colors.danger,
                  color: colors.text
                }}
              >
                💡 Creativo
              </button>
              <button
                onClick={() => handleQuickPreset('balanced', 0.4)}
                disabled={isLoading}
                className="px-3 py-2 text-xs rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50"
                style={{ 
                  backgroundColor: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`
                }}
              >
                ⚖️ Defecto
              </button>
            </div>
          </div>

          {/* Current Settings Summary - CENTERED WITH BULLETS */}
          <div className="flex justify-center">
            <div 
              className="p-4 rounded-lg border-l-4 max-w-md w-full"
              style={{ 
                backgroundColor: `${colors.accent}20`,
                borderLeftColor: colors.accent,
                border: `1px solid ${colors.border}`
              }}
            >
              <div className="text-sm space-y-1">
                <div className="font-semibold mb-2 text-center">Configuración Actual:</div>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <span className="w-2 mr-3">•</span>
                    <span>Temperatura: {temperature} ({getTemperatureLabel(temperature)})</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-2 mr-3">•</span>
                    <span>Estilo: {promptTemplates[selectedPrompt]?.name || selectedPrompt}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-2 mr-3">•</span>
                    <span>Prompt: {(selectedPrompt === 'custom' ? customPrompt : availableTemplates[selectedPrompt]?.template || '').length} caracteres</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        
        /* Custom range slider styles for photophobic theme */
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${getTemperatureColor(temperature)};
          border: 2px solid ${colors.background};
          cursor: pointer;
          box-shadow: 0 0 10px ${getTemperatureColor(temperature)}50;
        }
        
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${getTemperatureColor(temperature)};
          border: 2px solid ${colors.background};
          cursor: pointer;
          box-shadow: 0 0 10px ${getTemperatureColor(temperature)}50;
        }
      `}</style>
    </div>
  );
};

export default AdvancedControls;

