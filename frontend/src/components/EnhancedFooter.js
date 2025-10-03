import React from 'react';

const EnhancedFooter = ({ systemHealth, lastQueryMetrics, colors, systemError }) => {
  // Calcular uptime
  const getUptime = () => {
    if (!systemHealth.uptime) return 'N/A';
    const hours = Math.floor(systemHealth.uptime / 3600);
    const minutes = Math.floor((systemHealth.uptime % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // GPU Gauge Component
  const GPUGauge = ({ usage }) => {
    const getGpuColor = () => {
      if (usage < 50) return colors.success;
      if (usage <= 80) return colors.warning;
      return colors.danger;
    };

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', minWidth: '30px' }}>GPU:</span>
        <div style={{ 
          width: '100px', 
          height: '8px', 
          backgroundColor: colors.border,
          borderRadius: '4px',
          overflow: 'hidden',
          border: `1px solid ${colors.border}`
        }}>
          <div style={{
            width: `${usage}%`,
            height: '100%',
            backgroundColor: getGpuColor(),
            transition: 'width 0.3s ease',
            boxShadow: `0 0 4px ${getGpuColor()}`
          }}></div>
        </div>
        <span style={{ fontSize: '11px', minWidth: '35px', fontWeight: 'bold' }}>
          {usage}%
        </span>
      </div>
    );
  };

  // Status Indicator Component
  const StatusIndicator = ({ label, status }) => {
    const getStatusColor = () => {
      switch (status) {
        case 'healthy':
        case 'connected':
        case 'active':
          return colors.success;
        case 'error':
          return colors.danger;
        default:
          return colors.warning;
      }
    };

    const getStatusText = () => {
      switch (status) {
        case 'healthy': return 'OK';
        case 'connected': return 'ON';
        case 'active': return 'ON';
        case 'error': return 'ERR';
        default: return '?';
      }
    };

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px' }}>{label}:</span>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: getStatusColor(),
          boxShadow: `0 0 4px ${getStatusColor()}`,
          animation: status === 'error' ? 'pulse 1s infinite' : 'none'
        }}></div>
        <span style={{ 
          fontSize: '10px', 
          color: getStatusColor(),
          fontWeight: 'bold',
          minWidth: '25px'
        }}>
          {getStatusText()}
        </span>
      </div>
    );
  };

  // Similarity Histogram Component
  const SimilarityHistogram = ({ scores }) => {
    if (!scores || scores.length === 0) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '2px',
          height: '16px'
        }}>
          {[...Array(10)].map((_, i) => (
            <div key={i} style={{
              width: '4px',
              height: '12px',
              backgroundColor: colors.border,
              borderRadius: '1px'
            }}></div>
          ))}
        </div>
      );
    }

    // Tomar los primeros 10 scores
    const displayScores = scores.slice(0, 10);
    const maxScore = Math.max(...displayScores, 0.5);

    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-end', 
        gap: '2px',
        height: '16px'
      }}>
        {displayScores.map((score, i) => {
          const normalizedHeight = (score / maxScore) * 100;
          const barColor = score > 0.7 ? colors.success : 
                          score > 0.5 ? colors.warning : 
                          colors.danger;
          
          return (
            <div key={i} style={{
              width: '4px',
              height: `${Math.max(normalizedHeight * 0.16, 2)}px`,
              backgroundColor: barColor,
              borderRadius: '1px',
              transition: 'height 0.3s ease'
            }}></div>
          );
        })}
      </div>
    );
  };

  // Error Monitor Component
  const ErrorBox = ({ systemError }) => {
    if (!systemError) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px',
          fontSize: '11px',
          color: colors.success
        }}>
          <span>✓</span>
          <span>Sistema OK</span>
        </div>
      );
    }

    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        fontSize: '11px',
        color: colors.danger,
        backgroundColor: colors.surface,
        padding: '2px 8px',
        borderRadius: '3px',
        border: `1px solid ${colors.danger}`
      }}>
        <span>⚠</span>
        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {systemError}
        </span>
      </div>
    );
  };

  // Query Type Badge
  const QueryTypeBadge = ({ type }) => {
    const getTypeColor = () => {
      switch (type) {
        case 'conversational': return colors.accent;
        case 'knowledge': return colors.success;
        case 'hybrid': return colors.warning;
        default: return colors.border;
      }
    };

    const getTypeLabel = () => {
      switch (type) {
        case 'conversational': return 'CONV';
        case 'knowledge': return 'KNOW';
        case 'hybrid': return 'HYBR';
        default: return 'N/A';
      }
    };

    return (
      <span style={{
        fontSize: '10px',
        fontWeight: 'bold',
        padding: '2px 6px',
        borderRadius: '3px',
        backgroundColor: getTypeColor(),
        color: colors.background,
        minWidth: '40px',
        textAlign: 'center',
        display: 'inline-block'
      }}>
        {getTypeLabel()}
      </span>
    );
  };

  // Confidence Badge
  const ConfidenceBadge = ({ confidence }) => {
    if (!confidence) return <span style={{ fontSize: '11px' }}>N/A</span>;
    
    const getConfidenceColor = () => {
      if (confidence >= 0.7) return colors.success;
      if (confidence >= 0.4) return colors.warning;
      return colors.danger;
    };

    return (
      <span style={{
        fontSize: '11px',
        fontWeight: 'bold',
        color: getConfidenceColor()
      }}>
        {(confidence * 100).toFixed(0)}%
      </span>
    );
  };

  return (
    <div 
      className="enhanced-footer"
      style={{
        backgroundColor: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        padding: '6px 20px',
        fontSize: '11px',
        color: colors.textSecondary,
        flexShrink: 0,
        minHeight: '96px',
        maxHeight: '96px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '6px'
      }}
    >
      {/* LÍNEA 1: Sistema + Errores + Uptime */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '24px',
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: '4px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontWeight: 'bold', color: colors.text }}>
            Claude Infinito v1.1
          </span>
          <span style={{ fontSize: '10px' }}>
            Uptime: {getUptime()}
          </span>
          <span style={{ fontSize: '10px' }}>
            Env: {systemHealth.environment || 'unknown'}
          </span>
        </div>
        
        <ErrorBox systemError={systemError} />
      </div>

      {/* LÍNEA 2: Métricas RAG */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '24px',
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: '4px'
      }}>
        {lastQueryMetrics ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <QueryTypeBadge type={lastQueryMetrics.queryAnalysis?.query_type} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px' }}>Conf:</span>
                <ConfidenceBadge confidence={lastQueryMetrics.queryAnalysis?.confidence} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px' }}>Thold:</span>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                  {lastQueryMetrics.ragMetrics?.threshold_used?.toFixed(2) || '0.30'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px' }}>Time:</span>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: colors.accent }}>
                  {lastQueryMetrics.ragMetrics?.response_time_ms || 0}ms
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px' }}>Similarity:</span>
                <SimilarityHistogram scores={lastQueryMetrics.ragMetrics?.similarity_scores} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  fontSize: '10px', 
                  padding: '2px 6px', 
                  backgroundColor: colors.accent,
                  borderRadius: '3px',
                  color: colors.background
                }}>
                  Conv: {lastQueryMetrics.ragMetrics?.conversational_results || 0}
                </span>
                <span style={{ 
                  fontSize: '10px', 
                  padding: '2px 6px', 
                  backgroundColor: colors.success,
                  borderRadius: '3px',
                  color: colors.background
                }}>
                  Know: {lastQueryMetrics.ragMetrics?.knowledge_results || 0}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            width: '100%',
            justifyContent: 'center',
            fontStyle: 'italic',
            color: colors.textSecondary
          }}>
            Esperando query para mostrar métricas RAG...
          </div>
        )}
      </div>

      {/* LÍNEA 3: Monitores de Sistema */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '24px'
      }}>
        <GPUGauge usage={75} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <StatusIndicator label="Backend" status="healthy" />
          <StatusIndicator label="Claude" status="connected" />
          <StatusIndicator label="RTX" status="active" />
          
          {lastQueryMetrics?.queryAnalysis && (
            <div style={{ 
              fontSize: '10px',
              padding: '2px 6px',
              backgroundColor: colors.surfaceLight,
              borderRadius: '3px',
              border: `1px solid ${colors.border}`
            }}>
              Intent: {lastQueryMetrics.queryAnalysis.requires_context ? 'Context' : 'Direct'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnhancedFooter;
