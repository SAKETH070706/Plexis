const { buildSchema } = require('graphql');

const schema = buildSchema(`
  type UserProfile {
    id: ID!
    name: String!
    email: String!
    phone: String
    role: String!
    organizationId: ID
    organizationName: String
    studioCode: String
  }

  type GigAssignmentSummary {
    id: ID!
    uuid: String!
    title: String!
    eventCode: String!
    date: String!
    startTime: String!
    endTime: String!
    address: String!
    sessionPay: Float!
    status: String!
    attendanceTracking: Boolean!
    attendancePolicy: String
    assignmentMode: String
  }

  type AttendanceSummary {
    id: ID!
    eventId: ID!
    eventTitle: String
    checkInAt: String
    checkOutAt: String
    status: String!
    isExtended: Boolean
    actualMinutes: Float
    overtimeMinutes: Float
    overtimeStatus: String
  }

  type EarningsSummary {
    totalPaid: Float!
    pendingEarnings: Float!
    completedGigsCount: Int!
    pendingGigsCount: Int!
  }

  type AttendanceRequestSummary {
    id: ID!
    eventId: ID!
    eventTitle: String
    requestType: String!
    status: String!
    reason: String!
    createdAt: String!
  }

  type FreelancerDashboardData {
    user: UserProfile!
    assignedGigs: [GigAssignmentSummary!]!
    openGigs: [GigAssignmentSummary!]!
    activeAttendance: AttendanceSummary
    earnings: EarningsSummary!
    pendingRequests: [AttendanceRequestSummary!]!
  }

  type AdminKpiSummary {
    totalEvents: Int!
    activeEvents: Int!
    totalWorkers: Int!
    pendingOvertimeCount: Int!
    pendingPayoutTotal: Float!
  }

  type AdminEventSummary {
    id: ID!
    uuid: String!
    title: String!
    eventCode: String!
    date: String!
    startTime: String!
    endTime: String!
    address: String!
    status: String!
    attendanceTracking: Boolean!
    attendancePolicy: String
    requiredWorkers: Int!
    confirmedWorkersCount: Int!
    waitlistedWorkersCount: Int!
    sessionPay: Float!
  }

  type AdminAttendanceItem {
    id: ID!
    eventId: ID
    eventTitle: String
    workerName: String
    checkInAt: String
    status: String!
    overtimeStatus: String
  }

  type AdminLeadSummary {
    id: ID!
    name: String!
    phone: String
    email: String
    status: String!
    source: String
    createdAt: String
  }

  type AdminDashboardData {
    user: UserProfile!
    kpi: AdminKpiSummary!
    upcomingEvents: [AdminEventSummary!]!
    recentAttendance: [AdminAttendanceItem!]!
    recentLeads: [AdminLeadSummary!]!
  }

  type RosterWorkerSummary {
    id: ID!
    assignmentId: ID!
    name: String!
    email: String!
    phone: String
    status: String!
    joinedVia: String
  }

  type EventWithRoster {
    id: ID!
    uuid: String!
    title: String!
    eventCode: String!
    date: String!
    startTime: String!
    endTime: String!
    address: String!
    latitude: Float
    longitude: Float
    radius: Float
    attendanceTracking: Boolean!
    attendancePolicy: String
    requiredWorkers: Int!
    sessionPay: Float!
    overtimeRate: Float!
    travelAllowance: Float!
    status: String!
    confirmedCrew: [RosterWorkerSummary!]!
    waitlist: [RosterWorkerSummary!]!
    applications: [RosterWorkerSummary!]!
  }

  type Query {
    freelancerDashboard: FreelancerDashboardData!
    adminDashboard: AdminDashboardData!
    eventDetail(eventCode: String!): EventWithRoster
  }
`);

module.exports = schema;
