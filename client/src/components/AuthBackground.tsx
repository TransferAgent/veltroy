const tileStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(99,179,237,0.2)',
  borderRadius: '8px',
  padding: '1rem',
  color: '#E2E8F0',
  fontSize: '0.85rem',
};

const tileDot = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  marginRight: 6,
});

const tileMetric: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  color: '#63B3ED',
  marginTop: '0.5rem',
};

export function AuthBackground() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1b2a 50%, #0a1628 100%)',
      overflow: 'hidden',
      zIndex: 0,
    }}>
      <div style={{
        opacity: 0.15,
        filter: 'blur(3px)',
        transform: 'scale(1.05)',
        pointerEvents: 'none',
        padding: '2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
      }}>
        <div style={tileStyle}>
          <div style={tileDot('#48BB78')} /> Pipeline LIVE
          <div style={tileMetric}>1.12s</div>
        </div>
        <div style={tileStyle}>
          <div style={tileDot('#F6AD55')} /> Threats Blocked
          <div style={tileMetric}>14</div>
        </div>
        <div style={tileStyle}>
          <div style={tileDot('#48BB78')} /> DLQ NOMINAL
          <div style={tileMetric}>0 unexpected</div>
        </div>
        <div style={tileStyle}>
          <div style={tileDot('#63B3ED')} /> Sigma Rules
          <div style={tileMetric}>5 / 5 active</div>
        </div>
        <div style={tileStyle}>
          <div style={tileDot('#63B3ED')} /> Playbooks
          <div style={tileMetric}>KL-001-006</div>
        </div>
        <div style={tileStyle}>
          <div style={tileDot('#9F7AEA')} /> Blueprint
          <div style={tileMetric}>v1.2</div>
        </div>
      </div>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(5,10,20,0.65)',
        zIndex: 1,
      }} />
    </div>
  );
}
