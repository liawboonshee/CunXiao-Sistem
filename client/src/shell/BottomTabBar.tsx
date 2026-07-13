

export type TabKey = 'voice' | 'inventory';

interface Props {
  active: TabKey;
  onChange: (k: TabKey) => void;
}

const tabs = [
  {
    key: 'voice' as TabKey,
    label: '免费语音',
    icon: '🎙️',
  },
  {
    key: 'inventory' as TabKey,
    label: '库存宝',
    icon: '📦',
  },
];

export default function BottomTabBar({
  active,
  onChange,
}: Props) {
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        height: 'calc(56px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        zIndex: 1000,
      }}
    >
      {tabs.map((t) => {
        const selected = t.key === active;

        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              background: 'transparent',
              border: 'none',
              color: selected ? '#2563eb' : '#6b7280',
              fontSize: 12,
              fontWeight: selected ? 600 : 400,
            }}
          >
            <span style={{ fontSize: 20 }}>
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
