import React, { useState, useEffect, useRef } from 'react';
import exifr from 'exifr';
import api from '../api';
import { IconClock, IconCreditCard, IconAlertCircle } from './icons';

// Haversine formula helper for client-side geofence calculation
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const FreelancerPortal = ({ user }) => {
  const [assignedEvents, setAssignedEvents] = useState([]);
  const [openEvents, setOpenEvents] = useState([]);
  const [activeAttendance, setActiveAttendance] = useState(null);
  const [earnings, setEarnings] = useState({ totalPaid: 0, pendingEarnings: 0 });
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // 30-Minute Grace Period & Overtime Mode State
  const [showGraceModal, setShowGraceModal] = useState(false);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState(null);
  const [isOvertimeMode, setIsOvertimeMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const autoCheckoutTriggeredRef = useRef(false);

  // Overtime Proof on Checkout State
  const [showOvertimeCheckoutModal, setShowOvertimeCheckoutModal] = useState(false);
  const [checkoutPhotoFile, setCheckoutPhotoFile] = useState(null);
  const [checkoutPhotoPreview, setCheckoutPhotoPreview] = useState(null);
  const [checkoutPhotoMeta, setCheckoutPhotoMeta] = useState(null);
  const [submittingOvertimeCheckout, setSubmittingOvertimeCheckout] = useState(false);
  const checkoutPhotoInputRef = useRef(null);

  // Exception Request Modal state
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [selectedEventForIssue, setSelectedEventForIssue] = useState('');
  const [issueType, setIssueType] = useState('missing_checkin');
  const [issueReason, setIssueReason] = useState('');
  const [requestedTime, setRequestedTime] = useState('');

  // 1-second live clock ticker for live overtime & countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadPortalData();
  }, []);

  const loadPortalData = async () => {
    try {
      setLoading(true);
      const [eventsRes, attRes, earningsRes] = await Promise.all([
        api.get('/events'),
        api.get('/attendance?limit=5'),
        api.get('/payouts/freelancer/earnings'),
      ]);

      const allEvents = eventsRes.data.events || [];
      const myAssigned = allEvents.filter((e) => !e.isFull || e.assignedCount > 0);
      const openShifts = allEvents.filter((e) => e.assignmentMode === 'open' && !e.isFull);

      setAssignedEvents(myAssigned);
      setOpenEvents(openShifts);
      setEarnings({
        totalPaid: earningsRes.data.totalPaid || 0,
        pendingEarnings: earningsRes.data.pendingEarnings || 0,
      });

      // Find if currently checked in to any event
      const active = (attRes.data.attendance || []).find(
        (a) => a.status === 'checked_in' || a.status === 'manual_review'
      );
      setActiveAttendance(active || null);
      if (active?.isExtended) {
        setIsOvertimeMode(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── HELPER: Parse Shift Window & Check-in Gating ──────────────────
  const getShiftGateInfo = (event) => {
    if (!event) return { isUnlocked: false, message: 'No event' };
    const [sH, sM] = (event.startTime || '00:00').split(':').map(Number);
    const [eH, eM] = (event.endTime || '23:59').split(':').map(Number);
    const sDate = new Date(event.date);
    sDate.setHours(sH, sM, 0, 0);
    const eDate = new Date(event.date);
    eDate.setHours(eH, eM, 0, 0);

    const windowStart = new Date(sDate.getTime() - 30 * 60 * 1000); // 30 mins before
    const windowEnd = new Date(eDate.getTime() + 60 * 60 * 1000); // 60 mins after
    const now = new Date();

    const isToday = now.toISOString().split('T')[0] === new Date(event.date).toISOString().split('T')[0];

    if (!isToday || now < windowStart) {
      return {
        isUnlocked: false,
        isConcluded: false,
        windowStart,
        message: `🔒 Check-in opens at ${windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (30 mins prior to shift)`,
      };
    }

    if (now > windowEnd) {
      return {
        isUnlocked: false,
        isConcluded: true,
        message: '🔒 Event concluded. Check-in closed.',
      };
    }

    return {
      isUnlocked: true,
      isConcluded: false,
      windowStart,
      message: '🟢 Check-in Window Open (Within 30 mins)',
    };
  };

  // Nearest upcoming or assigned event
  const currentEvent = assignedEvents[0];
  const gateInfo = currentEvent ? getShiftGateInfo(currentEvent) : null;

  // ─── AUTO GPS GEOFENCED CHECK-IN (Chrome Background Watcher) ────────
  useEffect(() => {
    if (!currentEvent || activeAttendance || !gateInfo?.isUnlocked) return;
    if (!navigator.geolocation) return;

    let watchId = null;
    const venueLat = currentEvent.location?.latitude;
    const venueLon = currentEvent.location?.longitude;
    const radius = currentEvent.location?.radius || 150;

    if (venueLat == null || venueLon == null) return;

    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;
        const distance = getDistanceMeters(userLat, userLon, venueLat, venueLon);

        // If inside geofence radius and not yet checked in
        if (distance <= radius && !activeAttendance && !gpsLoading) {
          try {
            setGpsLoading(true);
            setStatusMessage(`🛰️ Geofence Detected (${distance}m away). Auto-checking in...`);

            const res = await api.post('/attendance/check-in', {
              eventId: currentEvent._id,
              latitude: userLat,
              longitude: userLon,
              accuracy: pos.coords.accuracy,
              checkInMethod: 'auto_gps',
            });

            setStatusMessage(`🛰️ Auto Check-In Successful: Welcome to ${currentEvent.title}!`);
            setActiveAttendance(res.data.attendance);
            loadPortalData();
          } catch (err) {
            console.warn('Auto check-in attempt error:', err.response?.data?.message);
          } finally {
            setGpsLoading(false);
          }
        }
      },
      (err) => {
        console.warn('Geolocation watchPosition warning:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEvent, activeAttendance, gateInfo?.isUnlocked]);

  // ─── 30-MINUTE GRACE PERIOD & AUTO-STOP TIMER ──────────────────────
  useEffect(() => {
    if (!activeAttendance || !activeAttendance.scheduledEnd) {
      setShowGraceModal(false);
      setGraceSecondsLeft(null);
      autoCheckoutTriggeredRef.current = false;
      return;
    }

    // Protection: If shift was extended or is in overtime mode, deactivate auto-stop grace modal
    if (activeAttendance.isExtended || isOvertimeMode) {
      setShowGraceModal(false);
      setGraceSecondsLeft(null);
      return;
    }

    const checkGracePeriod = async () => {
      const scheduledEnd = new Date(activeAttendance.scheduledEnd);
      const graceCutoff = new Date(scheduledEnd.getTime() + 30 * 60 * 1000); // +30m
      const now = new Date();

      if (now >= scheduledEnd) {
        const remainingSeconds = Math.max(0, Math.round((graceCutoff - now) / 1000));
        setGraceSecondsLeft(remainingSeconds);

        if (remainingSeconds > 0) {
          setShowGraceModal(true);
        } else if (!autoCheckoutTriggeredRef.current) {
          // Automatic 30-minute Cutoff Reached!
          autoCheckoutTriggeredRef.current = true;
          setShowGraceModal(false);
          try {
            setStatusMessage('🛑 30-minute grace period expired. Auto-stopping shift...');
            await api.post('/attendance/auto-checkout', {
              attendanceId: activeAttendance._id,
            });
            setStatusMessage('Shift automatically stopped (+30 min grace period recorded).');
            setActiveAttendance(null);
            loadPortalData();
          } catch (err) {
            console.error('Auto checkout error:', err);
          }
        }
      } else {
        setShowGraceModal(false);
        setGraceSecondsLeft(null);
      }
    };

    checkGracePeriod();
    const interval = setInterval(checkGracePeriod, 1000);
    return () => clearInterval(interval);
  }, [activeAttendance, isOvertimeMode]);

  // ─── MANUAL GPS CHECK-IN ───────────────────────────────────────────
  const handleCheckIn = (event) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setStatusMessage('Reading GPS satellites & verifying geofence...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.post('/attendance/check-in', {
            eventId: event._id,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            checkInMethod: 'gps',
          });

          setStatusMessage(res.data.message);
          setActiveAttendance(res.data.attendance);
          loadPortalData();
        } catch (err) {
          setStatusMessage(err.response?.data?.message || 'Check-in failed');
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        setStatusMessage('GPS Error: ' + err.message + '. Please allow location access or submit a manual request.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  // ─── MANUAL GPS CHECK-OUT ──────────────────────────────────────────
  const handleCheckOut = (attendanceRecord) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setStatusMessage('Capturing checkout timestamp...');
    setShowGraceModal(false);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.post('/attendance/check-out', {
            attendanceId: attendanceRecord._id,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });

          setStatusMessage(res.data.message);
          setActiveAttendance(null);
          loadPortalData();
        } catch (err) {
          setStatusMessage(err.response?.data?.message || 'Checkout failed');
        } finally {
          setGpsLoading(false);
        }
      },
      async () => {
        // Fallback checkout without GPS if hardware times out
        try {
          const res = await api.post('/attendance/check-out', {
            attendanceId: attendanceRecord._id,
          });
          setStatusMessage(res.data.message);
          setActiveAttendance(null);
          loadPortalData();
        } catch (err) {
          setStatusMessage(err.response?.data?.message || 'Checkout failed');
        } finally {
          setGpsLoading(false);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ─── EXTEND SHIFT & ENGAGE LIVE OVERTIME TRACKING ──────────────────
  const handleExtendShift = async () => {
    if (!activeAttendance) return;
    try {
      setStatusMessage('Extending shift & activating live overtime tracking...');
      const res = await api.post('/attendance/extend', {
        attendanceId: activeAttendance._id,
      });

      setShowGraceModal(false);
      setIsOvertimeMode(true);
      setActiveAttendance(res.data.attendance);
      setStatusMessage('⚡ Shift extended! Live overtime tracking engaged.');
    } catch (err) {
      console.error('Extend shift error:', err);
      alert(err.response?.data?.message || 'Failed to extend shift');
    }
  };

  // ─── INITIATE CHECK-OUT (OVERTIME PROOF MODAL VS INSTANT GPS) ───────
  const handleInitiateCheckOut = (attendanceRecord) => {
    const rec = attendanceRecord || activeAttendance;
    if (!rec) return;

    const scheduledEnd = rec.scheduledEnd ? new Date(rec.scheduledEnd) : null;
    const now = new Date();
    const hasOvertime = (scheduledEnd && now > scheduledEnd) || rec.isExtended || isOvertimeMode;

    if (hasOvertime) {
      // Overtime session completed: open proof of work modal
      setShowGraceModal(false);
      setShowOvertimeCheckoutModal(true);
    } else {
      // Normal checkout: instant checkout with no photo prompt
      setShowGraceModal(false);
      handleCheckOut(rec);
    }
  };

  // ─── CAPTURE PROOF PHOTO FOR OVERTIME CHECKOUT ──────────────────────
  const handleProofPhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCheckoutPhotoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setCheckoutPhotoPreview(previewUrl);

    // 1. Extract EXIF client-side via exifr
    let exifMeta = null;
    try {
      exifMeta = await exifr.parse(file, ['DateTimeOriginal', 'Make', 'Model', 'latitude', 'longitude']);
    } catch (exifErr) {
      console.warn('Could not read EXIF data:', exifErr.message);
    }

    // 2. Fetch live browser GPS coordinates
    let liveCoords = null;
    try {
      liveCoords = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 6000 }
        );
      });
    } catch {
      // GPS optional for metadata
    }

    setCheckoutPhotoMeta({
      capturedAt: exifMeta?.DateTimeOriginal ? new Date(exifMeta.DateTimeOriginal) : new Date(),
      deviceModel: exifMeta?.Model ? `${exifMeta.Make ? exifMeta.Make + ' ' : ''}${exifMeta.Model}` : 'Mobile Camera',
      latitude: liveCoords?.latitude || exifMeta?.latitude,
      longitude: liveCoords?.longitude || exifMeta?.longitude,
      accuracy: liveCoords?.accuracy || 0,
    });
  };

  // ─── SUBMIT PROOF & COMPLETE OVERTIME CHECKOUT ──────────────────────
  const handleSubmitOvertimeCheckout = async () => {
    if (!checkoutPhotoFile || !activeAttendance) return;

    setSubmittingOvertimeCheckout(true);
    setStatusMessage('Uploading overtime proof & finalizing shift checkout...');

    try {
      // Step 1: Upload proof photo to Cloudinary
      const formData = new FormData();
      formData.append('photo', checkoutPhotoFile);
      formData.append('attendanceId', activeAttendance._id);
      if (checkoutPhotoMeta?.capturedAt) {
        formData.append('clientCapturedAt', checkoutPhotoMeta.capturedAt.toISOString());
      }
      if (checkoutPhotoMeta?.deviceModel) {
        formData.append('deviceModel', checkoutPhotoMeta.deviceModel);
      }
      if (checkoutPhotoMeta?.latitude && checkoutPhotoMeta?.longitude) {
        formData.append('latitude', checkoutPhotoMeta.latitude);
        formData.append('longitude', checkoutPhotoMeta.longitude);
        formData.append('accuracy', checkoutPhotoMeta.accuracy || 0);
      }
      formData.append('caption', 'Completed venue / stage proof on checkout');

      await api.post('/attendance/upload-overtime-proof', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Step 2: Finalize checkout
      const checkOutPayload = {
        attendanceId: activeAttendance._id,
      };
      if (checkoutPhotoMeta?.latitude && checkoutPhotoMeta?.longitude) {
        checkOutPayload.latitude = checkoutPhotoMeta.latitude;
        checkOutPayload.longitude = checkoutPhotoMeta.longitude;
        checkOutPayload.accuracy = checkoutPhotoMeta.accuracy;
      }

      const checkOutRes = await api.post('/attendance/check-out', checkOutPayload);

      // Step 3: Cleanup & feedback
      setShowOvertimeCheckoutModal(false);
      setCheckoutPhotoFile(null);
      setCheckoutPhotoPreview(null);
      setCheckoutPhotoMeta(null);
      setIsOvertimeMode(false);
      setActiveAttendance(null);

      const successMsg = checkOutRes.data?.message || 'Shift completed! Overtime submitted for admin approval.';
      setStatusMessage(successMsg);
      alert('Shift completed! Overtime submitted for admin approval.');

      await loadPortalData();
    } catch (err) {
      console.error('Overtime checkout failed:', err);
      alert(err.response?.data?.message || 'Failed to complete overtime checkout. Please try again.');
      setStatusMessage('Overtime checkout failed.');
    } finally {
      setSubmittingOvertimeCheckout(false);
    }
  };

  // ─── OVERTIME STATS CALCULATOR ──────────────────────────────────────
  const getOvertimeStats = () => {
    if (!activeAttendance || !activeAttendance.scheduledEnd) {
      return { isOvertime: false, diffMinutes: 0, diffSeconds: 0, diffFormatted: '0 mins', scheduledEndStr: '--', checkOutStr: '--' };
    }
    const scheduledEnd = new Date(activeAttendance.scheduledEnd);
    const now = currentTime;
    const diffMs = Math.max(0, now - scheduledEnd);
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffSeconds = Math.floor((diffMs % 60000) / 1000);

    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    let diffFormatted = '';
    if (hours > 0) {
      diffFormatted = `${hours} hour${hours > 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}`;
    } else {
      diffFormatted = `${mins} minute${mins !== 1 ? 's' : ''}`;
    }

    return {
      isOvertime: (now > scheduledEnd) || activeAttendance.isExtended || isOvertimeMode,
      diffMinutes,
      diffSeconds,
      diffFormatted,
      scheduledEndStr: scheduledEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkOutStr: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const handleApplyShift = async (eventId) => {
    try {
      await api.post(`/events/${eventId}/apply`);
      alert('Application submitted! Admin will review your slot.');
      loadPortalData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to apply for shift');
    }
  };

  const handleSubmitIssueRequest = async (e) => {
    e.preventDefault();
    if (!selectedEventForIssue || !issueReason) return;
    try {
      await api.post('/attendance/request-correction', {
        eventId: selectedEventForIssue,
        requestType: issueType,
        requestedCheckIn: requestedTime ? new Date(requestedTime) : new Date(),
        reason: issueReason,
      });
      alert('Exception request submitted for admin review.');
      setShowExceptionModal(false);
      setIssueReason('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit request');
    }
  };

  // Helper format seconds to MM:SS
  const formatCountdown = (secs) => {
    if (secs == null) return '00:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="page-container">
      {/* HERO GPS SHIFT CARD */}
      <div className="freelancer-hero-card">
        <h2>Hello, {user?.name}! 👋</h2>
        <p>Your on-ground event workforce portal. Verify your shift presence using GPS.</p>

        {activeAttendance ? (
          <div className="active-shift-details">
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-verified">● Active Shift In-Progress</span>
                <span className="badge badge-open">
                  METHOD: {activeAttendance.checkInMethod?.toUpperCase() || 'GPS'}
                </span>
                {activeAttendance.isExtended && (
                  <span className="badge" style={{ background: '#7C3AED', color: '#FFFFFF', fontWeight: 600 }}>
                    ⚡ Shift Extended
                  </span>
                )}
                {activeAttendance.overtimeStatus === 'pending' && (
                  <span className="badge badge-alert">📸 Overtime Proof Pending Review</span>
                )}
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {activeAttendance.eventId?.title || 'Current Event'}
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#E9D5FF' }}>
                Checked in at:{' '}
                {new Date(activeAttendance.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' • '}Scheduled until:{' '}
                {new Date(activeAttendance.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>

              {/* Overtime Photos Badges if Uploaded */}
              {activeAttendance.overtimeProofPhotos && activeAttendance.overtimeProofPhotos.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#D8B4FE' }}>
                    📸 {activeAttendance.overtimeProofPhotos.length} Proof Photo(s) Attached
                  </span>
                  <a
                    href={activeAttendance.overtimeProofPhotos[activeAttendance.overtimeProofPhotos.length - 1].url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.78rem', color: '#fff', textDecoration: 'underline' }}
                  >
                    View Latest
                  </a>
                </div>
              )}

              {/* Live Overtime Banner with Ticking Counter */}
              {getOvertimeStats().isOvertime && (
                <div
                  style={{
                    marginTop: '12px',
                    background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.25), rgba(220, 38, 38, 0.35))',
                    border: '1px solid rgba(251, 146, 60, 0.6)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem' }}>⚡</span>
                    <div>
                      <strong style={{ color: '#FED7AA', fontSize: '0.95rem' }}>
                        Overtime in Progress: +{getOvertimeStats().diffMinutes} mins
                      </strong>
                      <div style={{ fontSize: '0.78rem', color: '#FFEDD5' }}>
                        {activeAttendance.isExtended ? 'Shift Extended • ' : ''}Live overtime tracking engaged. Proof of work required at checkout.
                      </div>
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: '#EA580C',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      padding: '4px 10px',
                    }}
                  >
                    +{getOvertimeStats().diffMinutes}m {getOvertimeStats().diffSeconds < 10 ? '0' : ''}{getOvertimeStats().diffSeconds}s
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="btn-checkout-large"
                onClick={() => handleInitiateCheckOut(activeAttendance)}
                disabled={gpsLoading || submittingOvertimeCheckout}
              >
                {gpsLoading ? 'Checking out...' : 'CHECK OUT NOW'}
              </button>
            </div>
          </div>
        ) : currentEvent ? (
          <div className="active-shift-details">
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-open">Upcoming Assigned Shift</span>
                <span className={`badge ${gateInfo?.isUnlocked ? 'badge-verified' : 'badge-alert'}`}>
                  {gateInfo?.message}
                </span>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{currentEvent.title}</h3>
              <p style={{ fontSize: '0.88rem', color: '#E9D5FF' }}>
                📍 {currentEvent.location?.address} | {currentEvent.startTime} - {currentEvent.endTime}
              </p>
              <p style={{ fontSize: '0.82rem', color: '#D8B4FE', marginTop: '4px' }}>
                Pay: ₹{currentEvent.sessionPay} | Geofence Radius: {currentEvent.location?.radius || 150}m
              </p>
            </div>

            <button
              className="btn-checkin-large"
              onClick={() => handleCheckIn(currentEvent)}
              disabled={gpsLoading || !gateInfo?.isUnlocked}
              style={{
                opacity: !gateInfo?.isUnlocked ? 0.6 : 1,
                cursor: !gateInfo?.isUnlocked ? 'not-allowed' : 'pointer',
              }}
              title={!gateInfo?.isUnlocked ? gateInfo?.message : 'Click to check in via GPS'}
            >
              {gpsLoading ? 'Verifying GPS...' : gateInfo?.isUnlocked ? '📍 GPS CHECK IN' : '🔒 CHECK-IN LOCKED'}
            </button>
          </div>
        ) : (
          <div className="active-shift-details">
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>No Assigned Shift Right Now</h3>
              <p style={{ fontSize: '0.85rem', color: '#E9D5FF' }}>
                Check available open shifts below to book upcoming event slots.
              </p>
            </div>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '10px 16px',
              borderRadius: '8px',
              marginTop: '14px',
              fontSize: '0.88rem',
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>

      {/* QUICK STATS & REPORT ISSUE */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon success">
            <IconCreditCard size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Paid Earnings</span>
            <span className="kpi-value">₹{earnings.totalPaid.toLocaleString('en-IN')}</span>
            <span className="kpi-sub">Directly disbursed to bank/UPI</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon warning">
            <IconClock size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Pending Earnings</span>
            <span className="kpi-value">₹{earnings.pendingEarnings.toLocaleString('en-IN')}</span>
            <span className="kpi-sub">Completed shifts awaiting payout</span>
          </div>
        </div>

        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setShowExceptionModal(true)}>
          <div className="kpi-icon info">
            <IconAlertCircle size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Report Attendance Issue</span>
            <span className="kpi-value" style={{ fontSize: '1.1rem' }}>Phone Dead / No GPS?</span>
            <span className="kpi-sub">Submit manual attendance request &rarr;</span>
          </div>
        </div>
      </div>

      {/* OPEN SHIFTS TO APPLY */}
      <div className="table-card">
        <div className="table-header-bar">
          <span className="table-header-title">Available Open Shifts (Apply to Work)</span>
        </div>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Title</th>
                <th>Date & Timing</th>
                <th>Venue Location</th>
                <th>Session Pay</th>
                <th>Crew Needed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {openEvents.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                    {loading ? 'Loading available shifts...' : 'No open shifts available right now. Check back soon!'}
                  </td>
                </tr>
              ) : (
                openEvents.map((ev) => (
                  <tr key={ev._id}>
                    <td>
                      <strong style={{ color: '#0F172A' }}>{ev.title}</strong>
                    </td>
                    <td>
                      {new Date(ev.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} | {ev.startTime} - {ev.endTime}
                    </td>
                    <td>📍 {ev.location?.address}</td>
                    <td>₹{ev.sessionPay}</td>
                    <td>{ev.requiredWorkers} workers</td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleApplyShift(ev._id)}
                      >
                        Apply for Shift
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 30-MINUTE GRACE PERIOD AUTO-STOP MODAL */}
      {showGraceModal && activeAttendance && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)' }}>
          <div className="modal-card" style={{ maxWidth: '500px', border: '2px solid #EF4444' }}>
            <div className="modal-header" style={{ background: '#FEF2F2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>⏰</span>
                <div>
                  <h3 style={{ margin: 0, color: '#991B1B' }}>Scheduled Shift Concluded</h3>
                  <span style={{ fontSize: '0.78rem', color: '#B91C1C' }}>
                    30-Minute Grace Cutoff in Progress
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-body" style={{ textAlign: 'center', padding: '24px' }}>
              <p style={{ fontSize: '0.92rem', color: '#475569', marginBottom: '14px' }}>
                Your scheduled shift has concluded. If you have finished work, check out now. If additional work is needed, extend your shift to continue live tracking.
              </p>

              <div
                style={{
                  background: '#F8FAFC',
                  border: '2px dashed #EF4444',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', display: 'block' }}>
                  AUTO-STOP COUNTDOWN
                </span>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#DC2626', letterSpacing: '2px' }}>
                  {formatCountdown(graceSecondsLeft)}
                </div>
                <small style={{ color: '#94A3B8', fontSize: '0.75rem' }}>
                  Shift will automatically terminate when timer reaches 00:00 unless extended.
                </small>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '1rem',
                    fontWeight: 600,
                    background: '#0284C7',
                    borderColor: '#0284C7',
                    color: '#FFFFFF',
                  }}
                  onClick={handleExtendShift}
                >
                  ⚡ EXTEND SHIFT (Continue Tracking)
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '0.95rem',
                    background: '#DC2626',
                    borderColor: '#DC2626',
                  }}
                  onClick={() => handleInitiateCheckOut(activeAttendance)}
                  disabled={gpsLoading}
                >
                  🛑 CHECK OUT (End Shift)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERTIME CHECKOUT & PROOF OF WORK MODAL */}
      {showOvertimeCheckoutModal && activeAttendance && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.8)' }}>
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Shift Conclusion & Overtime Verification</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  {activeAttendance.eventId?.title || 'Current Event'}
                </span>
              </div>
              <button
                className="modal-close"
                onClick={() => {
                  if (!submittingOvertimeCheckout) setShowOvertimeCheckoutModal(false);
                }}
                disabled={submittingOvertimeCheckout}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px' }}>
              {/* Summary Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)',
                  border: '1px solid #C7D2FE',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', fontWeight: 600 }}>
                      SCHEDULED END
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#1E293B' }}>
                      {getOvertimeStats().scheduledEndStr}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', fontWeight: 600 }}>
                      CHECKOUT TIME
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#1E293B' }}>
                      {getOvertimeStats().checkOutStr}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#EA580C', display: 'block', fontWeight: 700 }}>
                      TOTAL OVERTIME
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#EA580C' }}>
                      +{getOvertimeStats().diffMinutes}m
                    </strong>
                  </div>
                </div>
                <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.8rem', color: '#4F46E5', fontWeight: 500 }}>
                  Session Duration: {getOvertimeStats().diffFormatted} beyond scheduled shift
                </div>
              </div>

              {/* Proof of Work Requirement */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block', marginBottom: '6px', color: '#0F172A' }}>
                  Proof of Work Verification *
                </label>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 12px 0', lineHeight: 1.45 }}>
                  Please snap a photo of the completed venue/stage to verify your overtime session before checking out.
                </p>

                {/* Hidden camera input */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={checkoutPhotoInputRef}
                  style={{ display: 'none' }}
                  onChange={handleProofPhotoSelect}
                />

                {!checkoutPhotoPreview ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      padding: '14px',
                      border: '2px dashed var(--primary)',
                      background: '#FAF5FF',
                      color: 'var(--primary)',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                    onClick={() => checkoutPhotoInputRef.current?.click()}
                  >
                    📸 Take Proof Photo
                  </button>
                ) : (
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #10B981',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        color: '#059669',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        marginBottom: '10px',
                      }}
                    >
                      <span>✅</span> Proof Photo Captured
                    </div>

                    <div
                      style={{
                        background: '#000',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        maxHeight: '220px',
                        marginBottom: '10px',
                      }}
                    >
                      <img
                        src={checkoutPhotoPreview}
                        alt="Proof of work preview"
                        style={{
                          maxHeight: '220px',
                          maxWidth: '100%',
                          objectFit: 'contain',
                          verticalAlign: 'middle',
                        }}
                      />
                    </div>

                    {checkoutPhotoMeta && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-around',
                          fontSize: '0.75rem',
                          color: '#64748B',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '4px',
                        }}
                      >
                        <span>📱 {checkoutPhotoMeta.deviceModel}</span>
                        <span>⏰ {new Date(checkoutPhotoMeta.capturedAt).toLocaleTimeString()}</span>
                        {checkoutPhotoMeta.latitude && (
                          <span>📍 {checkoutPhotoMeta.latitude.toFixed(4)}, {checkoutPhotoMeta.longitude.toFixed(4)}</span>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => checkoutPhotoInputRef.current?.click()}
                      disabled={submittingOvertimeCheckout}
                      style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                    >
                      🔄 Retake Photo
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowOvertimeCheckoutModal(false)}
                disabled={submittingOvertimeCheckout}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitOvertimeCheckout}
                disabled={!checkoutPhotoFile || submittingOvertimeCheckout}
                style={{
                  background: !checkoutPhotoFile ? '#94A3B8' : '#059669',
                  borderColor: !checkoutPhotoFile ? '#94A3B8' : '#059669',
                  fontWeight: 600,
                  cursor: !checkoutPhotoFile ? 'not-allowed' : 'pointer',
                }}
              >
                {submittingOvertimeCheckout ? 'Uploading & Checking Out...' : 'Submit Proof & Check Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT EXCEPTION MODAL */}
      {showExceptionModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Report Attendance Exception</h3>
              <button className="modal-close" onClick={() => setShowExceptionModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmitIssueRequest}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
                  If your phone battery died, GPS was unavailable in a basement, or the app crashed, submit this request for admin review.
                </p>

                <div className="form-group">
                  <label>Select Event *</label>
                  <select
                    required
                    value={selectedEventForIssue}
                    onChange={(e) => setSelectedEventForIssue(e.target.value)}
                  >
                    <option value="">-- Choose Event --</option>
                    {assignedEvents.map((ev) => (
                      <option key={ev._id} value={ev._id}>
                        {ev.title} ({ev.startTime} - {ev.endTime})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Issue Type *</label>
                  <select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
                    <option value="missing_checkin">Could not Check In (Phone dead / No GPS)</option>
                    <option value="missing_checkout">Forgot / Could not Check Out</option>
                    <option value="both">Both Check In & Check Out missed</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Estimated Shift Time</label>
                  <input
                    type="datetime-local"
                    value={requestedTime}
                    onChange={(e) => setRequestedTime(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Detailed Explanation Reason *</label>
                  <textarea
                    rows="3"
                    required
                    placeholder="e.g. Phone battery died at 11:30 AM while shooting the wedding stage. Worked until 3:00 PM."
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowExceptionModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreelancerPortal;
