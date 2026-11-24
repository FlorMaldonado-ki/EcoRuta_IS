import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import type { Place, MeetingPoint } from '../types/api';

export interface InteractiveMapProps {
  origin: Place;
  destination: Place;
  meetingPoints?: MeetingPoint[];
  mode?: 'view' | 'edit_meeting_points';
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  /** Punto del conductor resaltado (el que eligió el pasajero). */
  selectedPointId?: string | null;
  /** Al tocar un punto de encuentro en el mapa (para elegirlo). */
  onPointPress?: (pointId: string) => void;
  /** Punto propuesto por el pasajero (marcador ★). */
  joinPoint?: { lat: number; lng: number; name?: string } | null;
  height?: number;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  origin,
  destination,
  meetingPoints = [],
  mode = 'view',
  onMapClick,
  selectedPointId = null,
  onPointPress,
  joinPoint = null,
  height = 320,
}) => {
  const iframeRef = useRef<any>(null);

  // Escuchar mensajes del iframe (Web): clic en el mapa (modo edición) o en un punto de encuentro.
  useEffect(() => {
    const listensClicks = mode === 'edit_meeting_points' && !!onMapClick;
    if (Platform.OS !== 'web' || (!listensClicks && !onPointPress)) return;

    const handleMessage = (event: MessageEvent) => {
      // Solo mensajes de ESTE mapa (puede haber varios en pantalla).
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (listensClicks && data && data.type === 'MAP_CLICK' && data.lat && data.lng) {
          onMapClick?.({ lat: Number(data.lat), lng: Number(data.lng) });
        } else if (data && data.type === 'MAP_POINT' && typeof data.id === 'string') {
          onPointPress?.(data.id);
        }
      } catch {
        // Ignorar mensajes no JSON de extensiones del navegador
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mode, onMapClick, onPointPress]);

  // Generar HTML autosuficiente con Leaflet + OpenStreetMap + OSRM
  const generateLeafletHtml = () => {
    const isEditMode = mode === 'edit_meeting_points';
    const pointsJson = JSON.stringify(meetingPoints);
    const originJson = JSON.stringify(origin);
    const destJson = JSON.stringify(destination);
    const selectedJson = JSON.stringify(selectedPointId);
    const joinJson = JSON.stringify(joinPoint);
    const pointsClickable = !!onPointPress;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
          .custom-div-icon {
            display: flex; align-items: center; justify-content: center;
            border-radius: 50%; color: white; font-weight: bold; font-family: sans-serif;
            font-size: 11px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 2px solid white;
          }
          .marker-origin { background-color: #15803D; }
          .marker-dest { background-color: #6B1736; }
          .marker-mp { background-color: #C59B27; color: #1E293B; font-weight: 800; }
          .marker-mp-selected { background-color: #6B1736; color: #fff; border: 3px solid #C59B27;
            box-shadow: 0 0 0 6px rgba(197,155,39,0.35), 0 2px 8px rgba(0,0,0,0.4); }
          .marker-join { background-color: #6B1736; color: #F3E5AB; font-size: 15px; border: 3px solid #C59B27;
            animation: pulse 1.6s ease-out infinite; }
          @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(107,23,54,0.55); } 100% { box-shadow: 0 0 0 16px rgba(107,23,54,0); } }
          .leaflet-popup-content { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; }
          .leaflet-popup-content h4 { margin: 0 0 4px 0; color: #6B1736; font-size: 13px; }
          .mode-badge {
            position: absolute; top: 10px; right: 10px; z-index: 1000;
            background: rgba(107, 23, 54, 0.9); color: #fff; padding: 6px 12px;
            border-radius: 20px; font-family: sans-serif; font-size: 11px; font-weight: bold;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        ${isEditMode ? '<div class="mode-badge">📍 Toca el mapa para marcar punto</div>' : ''}

        <script>
          const origin = ${originJson};
          const dest = ${destJson};
          const meetingPoints = ${pointsJson};
          const isEditMode = ${isEditMode};
          const selectedId = ${selectedJson};
          const joinPoint = ${joinJson};
          const pointsClickable = ${pointsClickable};

          // Inicializar mapa centrado en el promedio o en el origen
          const map = L.map('map', { zoomControl: true }).setView([origin.lat, origin.lng], 13);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap | EcoRuta Escolar',
            maxZoom: 19
          }).addTo(map);

          // Iconos personalizados con estilos institucionales
          const iconOrigin = L.divIcon({
            className: 'custom-div-icon marker-origin',
            html: 'A',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });

          const iconDest = L.divIcon({
            className: 'custom-div-icon marker-dest',
            html: 'B',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });

          const bounds = L.latLngBounds();

          const mOrigin = L.marker([origin.lat, origin.lng], { icon: iconOrigin })
            .addTo(map)
            .bindPopup('<h4>Origen</h4>' + origin.text);
          bounds.extend([origin.lat, origin.lng]);

          const mDest = L.marker([dest.lat, dest.lng], { icon: iconDest })
            .addTo(map)
            .bindPopup('<h4>Destino</h4>' + dest.text);
          bounds.extend([dest.lat, dest.lng]);

          meetingPoints.forEach((mp, index) => {
            const num = mp.order || (index + 1);
            const isSelected = selectedId && mp.id === selectedId;
            const size = isSelected ? 34 : 26;
            const iconMp = L.divIcon({
              className: 'custom-div-icon ' + (isSelected ? 'marker-mp-selected' : 'marker-mp'),
              html: num.toString(),
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2]
            });
            const marker = L.marker([mp.lat, mp.lng], { icon: iconMp, zIndexOffset: isSelected ? 1000 : 0 })
              .addTo(map)
              .bindPopup('<h4>Punto de Encuentro #' + num + (isSelected ? ' · Elegido' : '') + '</h4><b>' + (mp.name || 'Sin nombre') + '</b><br>' + (mp.description || ''));
            if (pointsClickable) {
              marker.on('click', function() {
                window.parent.postMessage(JSON.stringify({ type: 'MAP_POINT', id: mp.id }), '*');
              });
            }
            bounds.extend([mp.lat, mp.lng]);
          });

          // Punto propuesto por el pasajero
          if (joinPoint) {
            const iconJoin = L.divIcon({ className: 'custom-div-icon marker-join', html: '★', iconSize: [32, 32], iconAnchor: [16, 16] });
            L.marker([joinPoint.lat, joinPoint.lng], { icon: iconJoin, zIndexOffset: 1000 })
              .addTo(map)
              .bindPopup('<h4>Tu punto de unión</h4>' + (joinPoint.name || 'Punto propuesto'));
            bounds.extend([joinPoint.lat, joinPoint.lng]);
          }

          // Trazar ruta con OSRM y fallback a línea recta
          const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + origin.lng + ',' + origin.lat + ';' + dest.lng + ',' + dest.lat + '?overview=full&geometries=geojson';

          fetch(osrmUrl)
            .then(res => res.json())
            .then(data => {
              if (data && data.routes && data.routes[0]) {
                const route = data.routes[0];
                const routeLine = L.geoJSON(route.geometry, {
                  style: { color: '#6B1736', weight: 5, opacity: 0.85 }
                }).addTo(map);
                map.fitBounds(routeLine.getBounds().extend(bounds), { padding: [35, 35] }); // incluye los puntos de encuentro
              } else {
                throw new Error('Sin ruta OSRM');
              }
            })
            .catch(() => {
              // Fallback matemático línea recta con estilo de acento dorado
              const fallbackLine = L.polyline([
                [origin.lat, origin.lng],
                [dest.lat, dest.lng]
              ], { color: '#C59B27', weight: 4, dashArray: '6, 8', opacity: 0.9 }).addTo(map);
              map.fitBounds(fallbackLine.getBounds(), { padding: [35, 35] });
            });

          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [35, 35] });
          }

          // Escucha de toques/clics sobre el mapa en modo edición
          if (isEditMode) {
            map.on('click', function(e) {
              const payload = {
                type: 'MAP_CLICK',
                lat: e.latlng.lat,
                lng: e.latlng.lng
              };
              window.parent.postMessage(JSON.stringify(payload), '*');
            });
          }
        </script>
      </body>
      </html>
    `;
  };

  return (
    <View style={[styles.container, { height }]}>
      {Platform.OS === 'web' ? (
        <iframe
          ref={iframeRef}
          srcDoc={generateLeafletHtml()}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
          title="Mapa Interactivo EcoRuta"
        />
      ) : (
        // Visualizador nativo accesible si no se ejecuta en navegador
        <View style={styles.nativeFallback}>
          <MaterialCommunityIcons name="map-marker-path" size={40} color={THEME.colors.primary} />
          <Text style={styles.nativeFallbackTitle}>Recorrido EcoRuta (Leaflet / OSM)</Text>
          <Text style={styles.nativeFallbackText}>
            Origen: {origin.text} → Destino: {destination.text}
          </Text>
          <Text style={styles.nativeFallbackSubtext}>
            {meetingPoints.length} punto(s) de encuentro registrados
            {joinPoint ? ' · tu punto de unión marcado' : ''}
          </Text>
          {mode === 'edit_meeting_points' && (
            <TouchableOpacity
              style={styles.nativeSimulateBtn}
              onPress={() => {
                // Simulación de interacción geográfica en entorno móvil de prueba
                const randomOffset = (Math.random() - 0.5) * 0.01;
                onMapClick?.({
                  lat: Number((origin.lat + (destination.lat - origin.lat) * 0.5 + randomOffset).toFixed(6)),
                  lng: Number((origin.lng + (destination.lng - origin.lng) * 0.5 + randomOffset).toFixed(6)),
                });
              }}
            >
              <MaterialCommunityIcons name="plus-circle" size={18} color="#fff" />
              <Text style={styles.nativeSimulateText}>Marcar punto en el recorrido</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#E2E8F0',
    borderRadius: THEME.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginVertical: 12,
  },
  nativeFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8FAFC',
  },
  nativeFallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.primary,
    marginTop: 8,
  },
  nativeFallbackText: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },
  nativeFallbackSubtext: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  nativeSimulateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.pill,
    marginTop: 12,
  },
  nativeSimulateText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

