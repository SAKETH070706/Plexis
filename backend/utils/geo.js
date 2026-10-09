/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula (pure mathematical implementation, 0 external dependencies).
 * 
 * @param {number} lat1 Latitude of point 1 in decimal degrees
 * @param {number} lon1 Longitude of point 1 in decimal degrees
 * @param {number} lat2 Latitude of point 2 in decimal degrees
 * @param {number} lon2 Longitude of point 2 in decimal degrees
 * @returns {number} Distance in meters rounded to two decimal places
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

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
  const distanceMeters = calculateDistanceMeters(userLat, userLon, venueLat, venueLon);
  return {
    isWithin: distanceMeters <= radiusMeters,
    distanceMeters,
  };
}

module.exports = {
  calculateDistanceMeters,
  isWithinGeofence,
};
