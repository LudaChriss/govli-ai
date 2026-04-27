const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const TownHallMeeting = sequelize.define('TownHallMeeting', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Meeting Information
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Meeting title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Meeting description and agenda'
  },
  topic: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Primary topic or category'
  },

  // Scheduling
  scheduledDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'scheduled_date',
    comment: 'Date and time of meeting'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Expected duration in minutes'
  },
  timeZone: {
    type: DataTypes.STRING,
    defaultValue: 'America/New_York',
    field: 'time_zone',
    comment: 'Time zone for meeting'
  },

  // Location Information
  meetingType: {
    type: DataTypes.ENUM('in_person', 'virtual', 'hybrid'),
    defaultValue: 'hybrid',
    field: 'meeting_type',
    comment: 'Type of meeting'
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Physical location address'
  },
  venue: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Venue name (e.g., City Hall, Community Center)'
  },
  virtualMeetingUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'virtual_meeting_url',
    validate: {
      isUrl: true
    },
    comment: 'URL for virtual meeting (Zoom, Teams, etc.)'
  },
  virtualMeetingId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'virtual_meeting_id',
    comment: 'Meeting ID/code for virtual platform'
  },
  virtualMeetingPassword: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'virtual_meeting_password',
    comment: 'Password for virtual meeting'
  },

  // Registration and Capacity
  requiresRegistration: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_registration',
    comment: 'Whether registration is required'
  },
  registrationDeadline: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'registration_deadline',
    comment: 'Last date/time for registration'
  },
  maxAttendees: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_attendees',
    comment: 'Maximum number of attendees'
  },
  currentRegistrations: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'current_registrations',
    comment: 'Current number of registrations'
  },
  waitlistEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'waitlist_enabled',
    comment: 'Whether to enable waitlist when full'
  },

  // Organizer Information
  organizer: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Name of organizing department/person'
  },
  organizerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'organizer_email',
    validate: {
      isEmail: true
    },
    comment: 'Contact email for organizer'
  },
  organizerPhone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'organizer_phone',
    comment: 'Contact phone for organizer'
  },
  hostUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'host_user_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Primary host/moderator user'
  },

  // Meeting Status
  status: {
    type: DataTypes.ENUM('draft', 'published', 'cancelled', 'completed', 'rescheduled'),
    defaultValue: 'draft',
    allowNull: false,
    comment: 'Meeting status'
  },
  cancellationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cancellation_reason',
    comment: 'Reason for cancellation/rescheduling'
  },

  // Content and Materials
  agenda: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Agenda items as array of objects'
  },
  materials: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Meeting materials and documents'
  },
  recordingUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'recording_url',
    validate: {
      isUrl: true
    },
    comment: 'URL to meeting recording (after meeting)'
  },
  transcriptUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'transcript_url',
    validate: {
      isUrl: true
    },
    comment: 'URL to meeting transcript'
  },
  minutes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Meeting minutes/summary'
  },

  // Accessibility and Features
  liveStreamUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'live_stream_url',
    validate: {
      isUrl: true
    },
    comment: 'URL for public live stream'
  },
  closedCaptioning: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'closed_captioning',
    comment: 'Whether closed captioning is available'
  },
  signLanguageInterpreter: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'sign_language_interpreter',
    comment: 'Whether sign language interpreter is available'
  },
  languageTranslation: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'language_translation',
    comment: 'Available translation languages'
  },

  // Public Participation
  allowPublicQuestions: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'allow_public_questions',
    comment: 'Whether public can submit questions'
  },
  allowPublicComments: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'allow_public_comments',
    comment: 'Whether public can make comments'
  },
  publicSpeakingSlots: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'public_speaking_slots',
    comment: 'Number of public speaking slots available'
  },

  // Notifications
  sendReminders: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'send_reminders',
    comment: 'Whether to send reminder notifications'
  },
  reminderSchedule: {
    type: DataTypes.JSONB,
    defaultValue: { beforeDays: [7, 1], beforeHours: [24, 1] },
    field: 'reminder_schedule',
    comment: 'When to send reminders (days/hours before)'
  },

  // Tags and Categories
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization'
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Organizing department'
  },

  // Audit Fields
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  tableName: 'TownHallMeetings',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['scheduled_date']
    },
    {
      fields: ['status']
    },
    {
      fields: ['meeting_type']
    },
    {
      fields: ['host_user_id']
    },
    {
      fields: ['department']
    },
    {
      fields: ['tags'],
      using: 'gin' // GIN index for array search
    },
    {
      fields: ['createdAt']
    },
    {
      // Composite index for upcoming meetings
      fields: ['status', 'scheduled_date']
    }
  ]
});

module.exports = TownHallMeeting;
