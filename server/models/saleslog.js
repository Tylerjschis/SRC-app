// server/models/SalesLog.js
const mongoose = require('mongoose');

const SalesLogSchema = new mongoose.Schema({
  leadNumber: {
    type: Number,
    required: true
  },
  pmName: {
    type: String,
    required: true
  },
  clientName: {
    type: String,
    required: true
  },
  leadType: {
    type: String,
    enum: ['Warm', 'SelfGen'],
    required: true
  },
  appointmentSchedule: {
    date: Date,
    scheduledBy: {
      type: String,
      default: 'Bailey'
    }
  },
  appointmentConfirmed: {
    date: Date,
    confirmedBy: {
      type: String,
      default: 'PM'
    }
  },
  salesProcess: {
    isGhosted: {
      type: Boolean,
      default: false
    },
    mcOnly: {
      type: Boolean,
      default: false
    },
    mcAndDemo: {
      type: Boolean,
      default: false
    },
    demoReschedule: {
      date: Date
    },
    sepMcAndDemo: {
      type: Boolean,
      default: false
    },
    emailedProposal: {
      type: Boolean,
      default: false,
      date: Date
    }
  },
  results: {
    status: {
      type: String,
      enum: ['Lost', 'Pending', 'Sold'],
      default: 'Pending'
    },
    bidAmount: {
      type: Number,
      default: 0
    },
    soldAmount: {
      type: Number,
      default: 0
    }
  },
  followup: {
    scheduledDate: Date,
    call1: Date,
    call2: Date,
    call3: Date
  },
  explanation: {
    type: String
  },
  additionalNotes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save hook to update the updatedAt timestamp
SalesLogSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SalesLog', SalesLogSchema);