import mongoose, { Schema } from 'mongoose';
import {
  IStudentVerification,
  VerificationStatus,
  DocumentType,
  VerificationMethod,
  IInstitution,
  InstitutionType,
  IStudentWallet,
  IFundingRequest,
  FundingRequestStatus,
  IStudentBudget,
  ICampusPartner,
  OfferType,
  PartnershipStatus,
  IStudentProfile,
  StudentTier,
  IStudentMission,
  MissionStatus,
  IStudentLeaderboard,
  ICampusAmbassador,
  IStudentTransaction
} from '../types';

// Student Verification Model
const StudentVerificationSchema = new Schema<IStudentVerification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  studentIdNumber: { type: String, required: true },
  documentType: { type: String, enum: Object.values(DocumentType), required: true },
  documentUrl: { type: String, required: true },
  documentId: { type: String },
  status: { type: String, enum: Object.values(VerificationStatus), default: VerificationStatus.PENDING },
  submittedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date },
  expiresAt: { type: Date, required: true },
  verificationMethod: { type: String, enum: Object.values(VerificationMethod), default: VerificationMethod.MANUAL },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  rejectionReason: { type: String },
  autoVerificationScore: { type: Number },
  metadata: {
    ipAddress: String,
    deviceInfo: String,
    browserFingerprint: String
  },
  verificationHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId },
    reason: String
  }]
}, { timestamps: true });

StudentVerificationSchema.index({ userId: 1 });
StudentVerificationSchema.index({ institutionId: 1 });
StudentVerificationSchema.index({ status: 1 });
StudentVerificationSchema.index({ 'verificationHistory.changedAt': -1 });

// Institution Model
const InstitutionSchema = new Schema<IInstitution>({
  name: { type: String, required: true, unique: true },
  shortName: { type: String, required: true },
  type: { type: String, enum: Object.values(InstitutionType), required: true },
  domain: { type: String, unique: true, sparse: true },
  logo: String,
  address: {
    street: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: 'India' },
    pincode: { type: String, required: true },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    }
  },
  contact: {
    email: String,
    phone: String
  },
  verificationConfig: {
    allowAutoVerification: { type: Boolean, default: true },
    requireDocumentUpload: { type: Boolean, default: true },
    acceptedDocumentTypes: [{ type: String, enum: Object.values(DocumentType) }],
    autoVerifyDomains: [String]
  },
  partnership: {
    status: { type: String, enum: ['none', 'pending', 'active', 'expired'], default: 'none' },
    partnerSince: Date,
    expiresAt: Date,
    contractUrl: String
  },
  stats: {
    totalStudents: { type: Number, default: 0 },
    verifiedStudents: { type: Number, default: 0 },
    activeStudents: { type: Number, default: 0 }
  }
}, { timestamps: true });

InstitutionSchema.index({ 'address.city': 1, 'address.state': 1 });
InstitutionSchema.index({ domain: 1 });
InstitutionSchema.index({ type: 1 });
InstitutionSchema.index({ 'address.coordinates': '2dsphere' });
InstitutionSchema.index({ 'partnership.status': 1 });

// Student Wallet Model
const StudentWalletSchema = new Schema<IStudentWallet>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  verificationId: { type: Schema.Types.ObjectId, ref: 'StudentVerification', required: true },
  studentCash: {
    balance: { type: Number, default: 0, min: 0 },
    fundedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    monthlyAllowance: Number,
    spentThisMonth: { type: Number, default: 0 },
    budgetAlertAt: { type: Number, default: 80 },
    lastResetAt: { type: Date, default: Date.now }
  },
  parentConnections: [{
    parentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    relationship: { type: String, enum: ['mother', 'father', 'guardian', 'other'] },
    linkedAt: { type: Date, default: Date.now },
    monthlyLimit: Number,
    spendingLimitPerTransaction: Number,
    status: { type: String, enum: ['active', 'paused', 'removed'], default: 'active' }
  }],
  status: { type: String, enum: ['active', 'suspended', 'closed'], default: 'active' }
}, { timestamps: true });

StudentWalletSchema.index({ userId: 1 });
StudentWalletSchema.index({ institutionId: 1 });
StudentWalletSchema.index({ 'studentCash.fundedBy': 1 });
StudentWalletSchema.index({ status: 1 });

// Funding Request Model
const FundingRequestSchema = new Schema<IFundingRequest>({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 1 },
  reason: String,
  status: { type: String, enum: Object.values(FundingRequestStatus), default: FundingRequestStatus.PENDING },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: Date,
  responseNote: String,
  transactionId: { type: Schema.Types.ObjectId, ref: 'StudentTransaction' }
}, { timestamps: true });

FundingRequestSchema.index({ studentId: 1, status: 1 });
FundingRequestSchema.index({ parentId: 1, status: 1 });
FundingRequestSchema.index({ requestedAt: -1 });

// Student Budget Model
const StudentBudgetSchema = new Schema<IStudentBudget>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  monthlyBudget: { type: Number, required: true, min: 0 },
  categories: [{
    name: { type: String, required: true },
    limit: { type: Number, required: true, min: 0 },
    spent: { type: Number, default: 0, min: 0 },
    alerts: { type: Boolean, default: true }
  }],
  alerts: [{
    threshold: { type: Number, required: true }, // e.g., 80 for 80%
    notifiedAt: Date
  }],
  rolloverUnused: { type: Boolean, default: false },
  rolloverLimit: { type: Number, default: 0 }
}, { timestamps: true });

StudentBudgetSchema.index({ userId: 1 });

// Campus Partner Model
const CampusPartnerSchema = new Schema<ICampusPartner>({
  merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
  institutionIds: [{ type: Schema.Types.ObjectId, ref: 'Institution', required: true }],
  offerType: { type: String, enum: Object.values(OfferType), required: true },
  discountValue: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: Number,
  dailyLimit: Number,
  currentRedemptions: { type: Number, default: 0 },
  studentVerificationRequired: { type: Boolean, default: true },
  status: { type: String, enum: Object.values(PartnershipStatus), default: PartnershipStatus.PENDING },
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  terms: String,
  stats: {
    totalRedemptions: { type: Number, default: 0 },
    totalSavings: { type: Number, default: 0 },
    uniqueStudents: { type: Number, default: 0 },
    lastRedemptionAt: Date
  }
}, { timestamps: true });

CampusPartnerSchema.index({ merchantId: 1, status: 1 });
CampusPartnerSchema.index({ institutionIds: 1 });
CampusPartnerSchema.index({ offerType: 1 });
CampusPartnerSchema.index({ status: 1, startDate: 1, endDate: 1 });

// Student Profile Model
const StudentProfileSchema = new Schema<IStudentProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  verificationId: { type: Schema.Types.ObjectId, ref: 'StudentVerification', required: true },
  tier: { type: String, enum: Object.values(StudentTier), default: StudentTier.FRESHMAN },
  lifetimeCoins: { type: Number, default: 0 },
  currentCoins: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalSavings: { type: Number, default: 0 },
  missionsCompleted: [String],
  achievements: [{
    id: String,
    earnedAt: { type: Date, default: Date.now }
  }],
  referralCode: { type: String, unique: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'StudentProfile' },
  referralsCount: { type: Number, default: 0 },
  campusRank: Number,
  institutionRank: Number,
  lastActiveAt: { type: Date, default: Date.now }
}, { timestamps: true });

StudentProfileSchema.index({ userId: 1 });
StudentProfileSchema.index({ institutionId: 1, tier: 1 });
StudentProfileSchema.index({ referralCode: 1 }, { unique: true });
StudentProfileSchema.index({ campusRank: 1 });
StudentProfileSchema.index({ institutionRank: 1 });
StudentProfileSchema.index({ currentCoins: -1 });

// Student Mission Model
const StudentMissionSchema = new Schema<IStudentMission>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  missionId: { type: String, required: true },
  status: { type: String, enum: Object.values(MissionStatus), default: MissionStatus.AVAILABLE },
  progress: { type: Number, default: 0 },
  target: { type: Number, required: true },
  startedAt: Date,
  completedAt: Date,
  expiresAt: Date,
  rewardClaimed: { type: Boolean, default: false }
}, { timestamps: true });

StudentMissionSchema.index({ userId: 1, missionId: 1 }, { unique: true });
StudentMissionSchema.index({ userId: 1, status: 1 });
StudentMissionSchema.index({ expiresAt: 1 });

// Student Leaderboard Model
const StudentLeaderboardSchema = new Schema<IStudentLeaderboard>({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  period: { type: String, enum: ['weekly', 'monthly', 'all_time'], required: true },
  rankings: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    coins: Number,
    tier: String,
    lastUpdated: Date
  }],
  lastCalculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

StudentLeaderboardSchema.index({ institutionId: 1, period: 1 }, { unique: true });

// Campus Ambassador Model
const CampusAmbassadorSchema = new Schema<ICampusAmbassador>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  code: { type: String, unique: true, required: true },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  totalReferrals: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  payoutStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  stats: {
    clicks: { type: Number, default: 0 },
    signups: { type: Number, default: 0 },
    firstOrders: { type: Number, default: 0 }
  }
}, { timestamps: true });

CampusAmbassadorSchema.index({ userId: 1 });
CampusAmbassadorSchema.index({ code: 1 }, { unique: true });
CampusAmbassadorSchema.index({ institutionId: 1, status: 1 });

// Student Transaction Model
const StudentTransactionSchema = new Schema<IStudentTransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  type: { type: String, enum: ['order', 'funding', 'refund', 'bonus', 'redemption'], required: true },
  amount: { type: Number, required: true },
  balance: { type: Number, required: true },
  description: { type: String, required: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  fundingRequestId: { type: Schema.Types.ObjectId, ref: 'FundingRequest' },
  merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant' },
  category: String,
  coinsEarned: Number,
  studentDiscount: Number
}, { timestamps: true });

StudentTransactionSchema.index({ userId: 1, createdAt: -1 });
StudentTransactionSchema.index({ institutionId: 1, type: 1 });
StudentTransactionSchema.index({ merchantId: 1 });
StudentTransactionSchema.index({ orderId: 1 });

// Export Models
export const StudentVerification = mongoose.model<IStudentVerification>('StudentVerification', StudentVerificationSchema);
export const Institution = mongoose.model<IInstitution>('Institution', InstitutionSchema);
export const StudentWallet = mongoose.model<IStudentWallet>('StudentWallet', StudentWalletSchema);
export const FundingRequest = mongoose.model<IFundingRequest>('FundingRequest', FundingRequestSchema);
export const StudentBudget = mongoose.model<IStudentBudget>('StudentBudget', StudentBudgetSchema);
export const CampusPartner = mongoose.model<ICampusPartner>('CampusPartnerSchema', CampusPartnerSchema);
export const StudentProfile = mongoose.model<IStudentProfile>('StudentProfile', StudentProfileSchema);
export const StudentMission = mongoose.model<IStudentMission>('StudentMission', StudentMissionSchema);
export const StudentLeaderboard = mongoose.model<IStudentLeaderboard>('StudentLeaderboard', StudentLeaderboardSchema);
export const CampusAmbassador = mongoose.model<ICampusAmbassador>('CampusAmbassador', CampusAmbassadorSchema);
export const StudentTransaction = mongoose.model<IStudentTransaction>('StudentTransaction', StudentTransactionSchema);
