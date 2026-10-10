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
const GEOAPIFY_API_KEY =
  process.env.REACT_APP_GEOAPIFY_API_KEY || '89f36aab4d204b71ba7e554b24b3d50a';

const MapPicker = ({
  latitude,
  longitude,
  radius = 150,
  address = '',
  onLocationChange,
  showGeofenceControls = false,
}) => {
  const [activeMode, setActiveMode] = useState('map'); // 'gps', 'map', 'manual'
  const [loadingGps, setLoadingGps] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  // Geoapify Places Autocomplete state
  const [searchQuery, setSearchQuery] = useState(address || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const searchWrapperRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const currentLat = Number(latitude) || DEFAULT_LAT;
  const currentLng = Number(longitude) || DEFAULT_LNG;
  const currentRadius = Number(radius) || 150;

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const addressRef = useRef(address);
  addressRef.current = address;

  // Sync external address changes to input
  useEffect(() => {
    if (address && address !== searchQuery) {
      setSearchQuery(address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced Geoapify Places Autocomplete
  const fetchSuggestions = (query) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
          query.trim()
        )}&filter=countrycode:in&format=json&apiKey=${GEOAPIFY_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Geoapify request failed');
        const data = await res.json();
        const results = (data.results || []).map((item) => ({
          name: item.name || item.address_line1 || item.formatted,
          formatted: item.formatted,
          city: item.city || item.county || item.state || '',
          state: item.state || '',
          lat: item.lat,
          lon: item.lon,
        }));
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (err) {
        console.warn('Geoapify autocomplete error:', err.message);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
  };

  // When a Geoapify suggestion is clicked
  const handleSelectSuggestion = (place) => {
    const lat = Number(place.lat.toFixed(6));
    const lng = Number(place.lon.toFixed(6));
    setSearchQuery(place.formatted);
    setShowSuggestions(false);
    setSuggestions([]);

    onLocationChangeRef.current?.({
      latitude: lat,
      longitude: lng,
      radius: currentRadius,
      address: place.formatted,
    });

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
      markerRef.current?.setLatLng([lat, lng]);
      circleRef.current?.setLatLng([lat, lng]);
    }
  };

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
        setSearchQuery(data.display_name);
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
        color: showGeofenceControls ? '#6D28D9' : 'transparent',
        fillColor: showGeofenceControls ? '#8B5CF6' : 'transparent',
        fillOpacity: showGeofenceControls ? 0.2 : 0,
        weight: showGeofenceControls ? 2 : 0,
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
        circleRef.current.setStyle({
          color: showGeofenceControls ? '#6D28D9' : 'transparent',
          fillColor: showGeofenceControls ? '#8B5CF6' : 'transparent',
          fillOpacity: showGeofenceControls ? 0.2 : 0,
          weight: showGeofenceControls ? 2 : 0,
        });
      }
    }

    // Leaflet needs invalidateSize when shown in dynamically sized containers
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLat, currentLng, currentRadius, showGeofenceControls]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle Mode 2: Use My GPS
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
      {/* 1. Geoapify Places Autocomplete Search Box */}
      <div
        className="geoapify-search-wrapper"
        ref={searchWrapperRef}
        style={{ position: 'relative', marginBottom: '10px' }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              position: 'absolute',
              left: '12px',
              fontSize: '1rem',
              pointerEvents: 'none',
              opacity: 0.7,
            }}
          >
            🔍
          </span>
          <input
            type="text"
            className="geoapify-search-input"
            value={searchQuery}
            placeholder="Search venue, hotel, convention hall, temple across India..."
            style={{
              width: '100%',
              padding: '10px 38px 10px 38px',
              borderRadius: '8px',
              border: '1.5px solid #CBD5E1',
              fontSize: '0.88rem',
              outline: 'none',
              background: '#fff',
              transition: 'border-color 0.2s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              fetchSuggestions(e.target.value);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
          />
          {loadingSuggestions && (
            <span
              style={{
                position: 'absolute',
                right: '12px',
                fontSize: '0.85rem',
                color: '#6D28D9',
              }}
            >
              ⏳
            </span>
          )}
          {!loadingSuggestions && searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSuggestions([]);
                setShowSuggestions(false);
              }}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            className="geoapify-suggestions-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 9999,
              background: '#fff',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              boxShadow: '0 12px 28px -4px rgba(0,0,0,0.18)',
              marginTop: '4px',
              maxHeight: '220px',
              overflowY: 'auto',
              listStyle: 'none',
              padding: '4px 0',
            }}
          >
            {suggestions.map((place, idx) => (
              <li
                key={idx}
                onClick={() => handleSelectSuggestion(place)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: idx < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none',
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <span style={{ fontSize: '1.05rem', marginTop: '1px' }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      display: 'block',
                      fontSize: '0.86rem',
                      color: '#0F172A',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {place.name}
                  </strong>
                  <span
                    style={{
                      fontSize: '0.76rem',
                      color: '#64748B',
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {place.formatted}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Verified Venue Location Badge */}
      {address && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '6px',
            padding: '8px 12px',
            marginBottom: '10px',
            fontSize: '0.8rem',
            color: '#166534',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            <span>✅</span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {address}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              color: '#15803D',
              background: '#DCFCE7',
              padding: '2px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              marginLeft: '8px',
            }}
          >
            {Number(latitude || DEFAULT_LAT).toFixed(4)}, {Number(longitude || DEFAULT_LNG).toFixed(4)}
          </span>
        </div>
      )}

      {/* 2. Map Mode Selector */}
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
          onClick={() => setActiveMode(activeMode === 'manual' ? 'map' : 'manual')}
        >
          ✏️ {activeMode === 'manual' ? 'Close Coordinates' : 'Manual Coordinates'}
        </button>
      </div>

      {/* 3. Interactive Map View */}
      <div
        className="leaflet-map-wrapper"
        style={{
          display: activeMode === 'manual' ? 'none' : 'block',
        }}
        ref={mapContainerRef}
      />

      {activeMode !== 'manual' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: '#64748B',
            marginTop: '4px',
          }}
        >
          <span>💡 Select a venue via Places search above or drag pin to adjust venue position.</span>
          {reverseGeocoding && (
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Fetching address...</span>
          )}
        </div>
      )}

      {/* 4. Manual / Coordinates Editor (Visible only when in manual mode) */}
      {activeMode === 'manual' && (
        <div className="form-row" style={{ marginTop: '8px' }}>
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
      )}

      {/* 5. Geofence Radius Slider (50m to 500m) - ONLY active when strict geofence is requested */}
      {showGeofenceControls && (
        <div
          className="radius-slider-box"
          style={{
            marginTop: '10px',
            background: '#F5F3FF',
            border: '1.5px solid #DDD6FE',
            borderRadius: '8px',
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5B21B6' }}>
              📍 Geofence Check-in Radius
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6D28D9', fontWeight: 700 }}>
              {currentRadius} meters from venue
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
          <span style={{ fontSize: '0.76rem', color: '#6B21A8', fontWeight: 600, whiteSpace: 'nowrap' }}>
            (50m – 500m)
          </span>
        </div>
      )}
    </div>
  );
};

export default MapPicker;
