import { BACKEND_URL } from './api';

/**
 * Lightweight, zero-dependency GraphQL client using native fetch.
 * Reuses active JWT token and handles automatic 401 re-routing.
 */
export const graphqlQuery = async (query, variables = {}) => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${BACKEND_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth:unauthorized'));
    throw new Error('Unauthorized');
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'GraphQL Query Execution Error');
  }

  return json.data;
};

export const GET_FREELANCER_DASHBOARD = `
  query GetFreelancerDashboard {
    freelancerDashboard {
      user {
        id
        name
        email
        phone
        role
        organizationName
      }
      assignedGigs {
        id
        uuid
        title
        eventCode
        date
        startTime
        endTime
        address
        sessionPay
        status
        attendanceTracking
        attendancePolicy
        assignmentMode
      }
      openGigs {
        id
        uuid
        title
        eventCode
        date
        startTime
        endTime
        address
        sessionPay
        status
        attendanceTracking
        attendancePolicy
        assignmentMode
      }
      activeAttendance {
        id
        eventId
        eventTitle
        checkInAt
        checkOutAt
        status
        isExtended
        actualMinutes
        overtimeMinutes
        overtimeStatus
      }
      earnings {
        totalPaid
        pendingEarnings
        completedGigsCount
        pendingGigsCount
      }
      pendingRequests {
        id
        eventId
        eventTitle
        requestType
        status
        reason
        createdAt
      }
    }
  }
`;

export const GET_ADMIN_DASHBOARD = `
  query GetAdminDashboard {
    adminDashboard {
      user {
        id
        name
        email
        phone
        role
        organizationName
        studioCode
      }
      kpi {
        totalEvents
        activeEvents
        totalWorkers
        pendingOvertimeCount
        pendingPayoutTotal
      }
      upcomingEvents {
        id
        uuid
        title
        eventCode
        date
        startTime
        endTime
        address
        status
        attendanceTracking
        attendancePolicy
        requiredWorkers
        confirmedWorkersCount
        waitlistedWorkersCount
        sessionPay
      }
      recentAttendance {
        id
        eventId
        eventTitle
        workerName
        checkInAt
        status
        overtimeStatus
      }
      recentLeads {
        id
        name
        phone
        email
        status
        source
        createdAt
      }
    }
  }
`;

export const GET_EVENT_DETAIL = `
  query GetEventDetail($eventCode: String!) {
    eventDetail(eventCode: $eventCode) {
      id
      uuid
      title
      eventCode
      date
      startTime
      endTime
      address
      latitude
      longitude
      radius
      attendanceTracking
      attendancePolicy
      requiredWorkers
      sessionPay
      overtimeRate
      travelAllowance
      status
      confirmedCrew {
        id
        assignmentId
        name
        email
        phone
        status
        joinedVia
      }
      waitlist {
        id
        assignmentId
        name
        email
        phone
        status
        joinedVia
      }
      applications {
        id
        assignmentId
        name
        email
        phone
        status
        joinedVia
      }
    }
  }
`;
