import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom SVG Pin Icon to avoid missing PNG asset issues in bundlers
const createMapPinIcon = () => {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));
        transform: translate(-50%, -100%);
      ">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z" fill="#6D28D9" stroke="#ffffff" stroke-width="1.5"/>
          <circle cx="12" cy="9" r="3" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

const DEFAULT_LAT = 17.385044; // Hyderabad / Central India default
const DEFAULT_LNG = 78.486671;

const MapPicker = ({
  latitude,
  longitude,
  radius = 150,
  address = '',
  onLocationChange,
}) => {
  const [activeMode, setActiveMode] = useState('map'); // 'gps', 'map', 'manual'
  const [loadingGps, setLoadingGps] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const currentLat = Number(latitude) || DEFAULT_LAT;
  const currentLng = Number(longitude) || DEFAULT_LNG;
  const currentRadius = Number(radius) || 150;

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const addressRef = useRef(address);
  addressRef.current = address;

  // Reverse geocode lat/lng to human address
  const reverseGeocode = async (lat, lng) => {
    try {
      setReverseGeocoding(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.display_name) {
        onLocationChangeRef.current?.({
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          radius: currentRadius,
          address: data.display_name,
        });
      }
    } catch (err) {
      console.warn('Reverse geocoding warning:', err.message);
    } finally {
      setReverseGeocoding(false);
    }
  };

  // Initialize and maintain Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentLat, currentLng],
        zoom: 15,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const pinIcon = createMapPinIcon();
      const marker = L.marker([currentLat, currentLng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      const circle = L.circle([currentLat, currentLng], {
        radius: currentRadius,
        color: '#6D28D9',
        fillColor: '#8B5CF6',
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(map);

      // Map Click event: drop pin anywhere
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        onLocationChangeRef.current?.({
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          radius: currentRadius,
          address: addressRef.current,
        });
        reverseGeocode(lat, lng);
      });

      // Marker Drag event
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        onLocationChangeRef.current?.({
          latitude: Number(pos.lat.toFixed(6)),
          longitude: Number(pos.lng.toFixed(6)),
          radius: currentRadius,
          address: addressRef.current,
        });
        reverseGeocode(pos.lat, pos.lng);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    } else {
      // Map already exists, update position and circle radius
      const map = mapInstanceRef.current;
      map.setView([currentLat, currentLng], map.getZoom());
      if (markerRef.current) {
        markerRef.current.setLatLng([currentLat, currentLng]);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([currentLat, currentLng]);
        circleRef.current.setRadius(currentRadius);
      }
    }

    // Leaflet needs invalidateSize when shown in dynamically sized containers
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLat, currentLng, currentRadius]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle Mode 1: Use My GPS
  const handleUseDeviceGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setLoadingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoadingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));

        onLocationChange({
          latitude: lat,
          longitude: lng,
          radius: currentRadius,
          address,
        });

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16);
          markerRef.current?.setLatLng([lat, lng]);
          circleRef.current?.setLatLng([lat, lng]);
        }

        reverseGeocode(lat, lng);
      },
      (err) => {
        setLoadingGps(false);
        alert('Unable to retrieve location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="map-picker-container">
      {/* 3 Explicit Location Selection Modes */}
      <div className="map-mode-selector">
        <button
          type="button"
          className={`map-mode-btn ${activeMode === 'map' ? 'active' : ''}`}
          onClick={() => {
            setActiveMode('map');
            setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
          }}
        >
          🗺️ Pick on Map
        </button>
        <button
          type="button"
          className={`map-mode-btn ${activeMode === 'gps' ? 'active' : ''}`}
          onClick={() => {
            setActiveMode('gps');
            handleUseDeviceGps();
          }}
        >
          📍 {loadingGps ? 'Locating...' : 'Use My GPS'}
        </button>
        <button
          type="button"
          className={`map-mode-btn ${activeMode === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveMode('manual')}
        >
          ✏️ Manual Entry
        </button>
      </div>

      {/* Interactive Map View */}
      <div
        className="leaflet-map-wrapper"
        style={{
          display: activeMode === 'manual' ? 'none' : 'block',
        }}
        ref={mapContainerRef}
      />

      {activeMode !== 'manual' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#64748B' }}>
          <span>💡 Click anywhere on map or drag pin to adjust venue position.</span>
          {reverseGeocoding && <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Fetching address...</span>}
        </div>
      )}

      {/* Manual / Coordinates Editor */}
      <div className="form-row" style={{ marginTop: '4px' }}>
        <div className="form-group">
          <label>Latitude *</label>
          <input
            type="number"
            step="any"
            value={latitude}
            placeholder="e.g. 17.385044"
            onChange={(e) =>
              onLocationChange({
                latitude: e.target.value === '' ? '' : Number(e.target.value),
                longitude: longitude === '' ? '' : Number(longitude),
                radius: currentRadius,
                address,
              })
            }
          />
        </div>
        <div className="form-group">
          <label>Longitude *</label>
          <input
            type="number"
            step="any"
            value={longitude}
            placeholder="e.g. 78.486671"
            onChange={(e) =>
              onLocationChange({
                latitude: latitude === '' ? '' : Number(latitude),
                longitude: e.target.value === '' ? '' : Number(e.target.value),
                radius: currentRadius,
                address,
              })
            }
          />
        </div>
      </div>

      {/* Geofence Radius Slider (50m to 500m) with Live Preview */}
      <div className="radius-slider-box">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '130px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Geofence Radius
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>
            {currentRadius} meters
          </span>
        </div>
        <input
          type="range"
          min="50"
          max="500"
          step="10"
          value={currentRadius}
          onChange={(e) => {
            const newRadius = Number(e.target.value);
            onLocationChange({
              latitude: Number(latitude),
              longitude: Number(longitude),
              radius: newRadius,
              address,
            });
          }}
        />
        <span style={{ fontSize: '0.76rem', color: '#64748B', whiteSpace: 'nowrap' }}>
          (50m – 500m)
        </span>
      </div>
    </div>
  );
};

export default MapPicker;
