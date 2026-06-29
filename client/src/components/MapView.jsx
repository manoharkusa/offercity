import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon paths broken by Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const makeIcon = (color = 'var(--brand)') => L.divIcon({
  className: '',
  html: `<div style="
    width:22px;height:22px;
    background:${color};
    border:3px solid #fff;
    border-radius:50%;
    box-shadow:0 2px 6px rgba(0,0,0,.4);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
});

// Fly to new center when props change
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, map.getZoom(), { duration: 0.8 });
  }, [center[0], center[1]]);
  return null;
}

export default function MapView({ center, markers = [], route = null, onMarkerClick }) {
  const isValid = (v) => typeof v === 'number' && isFinite(v) && v !== 0;
  const latlng = (center && isValid(center[0]) && isValid(center[1]))
    ? [center[1], center[0]]
    : [17.3850, 78.4867]; // fallback: Hyderabad

  return (
    <MapContainer
      center={latlng}
      zoom={13}
      style={{ height: 380, width: '100%', borderRadius: 12, zIndex: 1 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Recenter center={latlng} />

      {markers.filter(m => isValid(m.lat) && isValid(m.lng)).map((m, i) => (
        <Marker
          key={i}
          position={[m.lat, m.lng]}
          icon={makeIcon(m.color || 'var(--brand)')}
          eventHandlers={onMarkerClick && m.id ? { click: () => onMarkerClick(m) } : {}}
        >
          {m.label && (
            <Popup>
              <div style={{ minWidth: 140 }}>
                <strong style={{ color: 'var(--brand)' }}>{m.label}</strong>
                {m.sublabel && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>{m.sublabel}</p>}
                {m.link && (
                  <a href={m.link} style={{ display: 'block', marginTop: 6, color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
                    View Shop →
                  </a>
                )}
              </div>
            </Popup>
          )}
        </Marker>
      ))}

      {route?.coordinates && (
        <Polyline
          positions={route.coordinates.map(([lng, lat]) => [lat, lng])}
          color="var(--brand)"
          weight={4}
        />
      )}
    </MapContainer>
  );
}
