function isValidCoordinate(lat, lon) {
  if (lat === null || lon === null || lat === undefined || lon === undefined) {
    return false;
  }
  if (typeof lat === 'string' && lat.trim() === '') return false;
  if (typeof lon === 'string' && lon.trim() === '') return false;
  const nLat = Number(lat);
  const nLon = Number(lon);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLon) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLon >= -180 &&
    nLon <= 180
  );
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula (pure mathematical implementation, 0 external dependencies).
 * 
 * @param {number} lat1 Latitude of point 1 in decimal degrees
 * @param {number} lon1 Longitude of point 1 in decimal degrees
 * @param {number} lat2 Latitude of point 2 in decimal degrees
 * @param {number} lon2 Longitude of point 2 in decimal degrees
 * @returns {number} Distance in meters rounded to two decimal places, or Infinity if invalid
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return Infinity;
  }

  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(Number(lat1));
  const phi2 = toRad(Number(lat2));
  const deltaPhi = toRad(Number(lat2) - Number(lat1));
  const deltaLambda = toRad(Number(lon2) - Number(lon1));

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  return Math.round(distance * 100) / 100; // in meters, 2 decimal places
}

/**
 * Checks whether user coordinates are within an event venue's geofence radius.
 * 
 * @param {number} userLat Worker latitude
 * @param {number} userLon Worker longitude
 * @param {number} venueLat Event venue latitude
 * @param {number} venueLon Event venue longitude
 * @param {number} radiusMeters Allowed radius in meters (default 150m)
 * @returns {{ isWithin: boolean, distanceMeters: number }}
 */
function isWithinGeofence(userLat, userLon, venueLat, venueLon, radiusMeters = 150) {
  const safeRadius = Math.max(0, Number(radiusMeters) || 150);
  const distanceMeters = calculateDistanceMeters(userLat, userLon, venueLat, venueLon);

  if (!Number.isFinite(distanceMeters) || distanceMeters === Infinity) {
    return {
      isWithin: false,
      distanceMeters: 999999,
    };
  }

  return {
    isWithin: distanceMeters <= safeRadius,
    distanceMeters,
  };
}

module.exports = {
  isValidCoordinate,
  calculateDistanceMeters,
  isWithinGeofence,
};
