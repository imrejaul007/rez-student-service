import mongoose, { Types } from 'mongoose';

// ==================== ENUMS ====================

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export enum DocumentType {
  ID_CARD = 'id_card',
  ADMIT_CARD = 'admit_card',
  BONAFIDE = 'bonafide',
  AADHAR = 'aadhar',
  PASSPORT = 'passport',
  COLLEGE_ID = 'college_id'
}

export enum VerificationMethod {
  AUTO = 'auto',
  MANUAL = 'manual'
}

export enum InstitutionType {
  UNIVERSITY = 'university',
  COLLEGE = 'college',
  SCHOOL = 'school',
  INSTITUTE = 'institute'
}

export enum FundingRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export enum OfferType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  BUY_ONE_GET_ONE = 'buy_one_get_one',
  FREE_DELIVERY = 'free_delivery'
}

export enum PartnershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export enum StudentTier {
  FRESHMAN = 'freshman',
  SOPHOMORE = 'sophomore',
  JUNIOR = 'junior',
  SENIOR = 'senior',
  SCHOLAR = 'scholar'
}

export enum MissionStatus {
  AVAILABLE = 'available',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  EXPIRED = 'expired'
}

// ==================== INTERFACES ====================

export interface IStudentVerification {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  institutionId: Types.ObjectId;
  studentIdNumber: string;
  documentType: DocumentType;
  documentUrl: string;
  documentId?: string;
  status: VerificationStatus;
  submittedAt: Date;
  verifiedAt?: Date;
  expiresAt: Date;
  verificationMethod: VerificationMethod;
  verifiedBy?: Types.ObjectId;
  rejectionReason?: string;
  autoVerificationScore?: number;
  metadata?: {
    ipAddress?: string;
    deviceInfo?: string;
    browserFingerprint?: string;
  };
  verificationHistory: Array<{
    status: VerificationStatus;
    changedAt: Date;
    changedBy: Types.ObjectId | string;
    reason: string;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IInstitution {
  _id?: Types.ObjectId;
  name: string;
  shortName: string;
  type: InstitutionType;
  domain?: string;
  logo?: string;
  address: {
    street?: string;
    city: string;
    state: string;
    country?: string;
    pincode: string;
    coordinates?: {
      type: string;
      coordinates: number[];
    };
  };
  contact?: {
    email?: string;
    phone?: string;
  };
  verificationConfig?: {
    allowAutoVerification: boolean;
    requireDocumentUpload: boolean;
    acceptedDocumentTypes: DocumentType[];
    autoVerifyDomains: string[];
  };
  partnership?: {
    status: string;
    partnerSince?: Date;
    expiresAt?: Date;
    contractUrl?: string;
  };
  stats?: {
    totalStudents: number;
    verifiedStudents: number;
    activeStudents: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudentWallet {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  institutionId: Types.ObjectId;
  verificationId: Types.ObjectId;
  studentCash: {
    balance: number;
    fundedBy: Types.ObjectId[];
    monthlyAllowance?: number;
    spentThisMonth: number;
    budgetAlertAt: number;
    lastResetAt: Date;
  };
  parentConnections: Array<{
    parentId: Types.ObjectId;
    relationship: 'mother' | 'father' | 'guardian' | 'other';
    linkedAt: Date;
    monthlyLimit?: number;
    spendingLimitPerTransaction?: number;
    status: 'active' | 'paused' | 'removed';
  }>;
  status: 'active' | 'suspended' | 'closed';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFundingRequest {
  _id?: Types.ObjectId;
  studentId: Types.ObjectId;
  parentId: Types.ObjectId;
  amount: number;
  reason?: string;
  status: FundingRequestStatus;
  requestedAt: Date;
  respondedAt?: Date;
  responseNote?: string;
  transactionId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudentBudget {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  institutionId: Types.ObjectId;
  monthlyBudget: number;
  categories: Array<{
    name: string;
    limit: number;
    spent: number;
    alerts: boolean;
  }>;
  alerts: Array<{
    threshold: number;
    notifiedAt?: Date;
  }>;
  rolloverUnused: boolean;
  rolloverLimit: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICampusPartner {
  _id?: Types.ObjectId;
  merchantId: Types.ObjectId;
  institutionIds: Types.ObjectId[];
  offerType: OfferType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  dailyLimit?: number;
  currentRedemptions: number;
  studentVerificationRequired: boolean;
  status: PartnershipStatus;
  startDate: Date;
  endDate?: Date;
  terms?: string;
  stats: {
    totalRedemptions: number;
    totalSavings: number;
    uniqueStudents: number;
    lastRedemptionAt?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudentProfile {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  institutionId: Types.ObjectId;
  verificationId: Types.ObjectId;
  tier: StudentTier;
  lifetimeCoins: number;
  currentCoins: number;
  totalOrders: number;
  totalSavings: number;
  missionsCompleted: string[];
  achievements: Array<{
    id: string;
    earnedAt: Date;
  }>;
  referralCode: string;
  referredBy?: Types.ObjectId;
  referralsCount: number;
  campusRank?: number;
  institutionRank?: number;
  lastActiveAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudentMission {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  missionId: string;
  status: MissionStatus;
  progress: number;
  target: number;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt: Date;
  rewardClaimed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudentLeaderboard {
  _id?: Types.ObjectId;
  institutionId: Types.ObjectId;
  period: 'weekly' | 'monthly' | 'all_time';
  rankings: Array<{
    userId: Types.ObjectId | string;
    coins: number;
    tier: StudentTier;
    lastUpdated: Date;
  }>;
  lastCalculatedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICampusAmbassador {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  institutionId: Types.ObjectId;
  code: string;
  status: 'active' | 'inactive' | 'suspended';
  totalReferrals: number;
  totalEarnings: number;
  payoutStatus: 'pending' | 'paid';
  stats: {
    clicks: number;
    signups: number;
    firstOrders: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudentTransaction {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  institutionId: Types.ObjectId;
  type: 'order' | 'funding' | 'refund' | 'bonus' | 'redemption';
  amount: number;
  balance: number;
  description: string;
  orderId?: Types.ObjectId;
  fundingRequestId?: Types.ObjectId;
  merchantId?: Types.ObjectId;
  category?: string;
  coinsEarned?: number;
  studentDiscount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== CONFIG & CONSTANTS ====================

export interface StudentTierConfig {
  minCoins: number;
  multiplier: number;
  badge: string;
  perks: string[];
}

export const STUDENT_TIER_CONFIG: Record<StudentTier, StudentTierConfig> = {
  [StudentTier.FRESHMAN]: {
    minCoins: 0,
    multiplier: 1.5,
    badge: 'FRESHMEN',
    perks: ['5% extra coins', 'Basic offers']
  },
  [StudentTier.SOPHOMORE]: {
    minCoins: 500,
    multiplier: 1.75,
    badge: 'SOPHOMORE',
    perks: ['7% extra coins', 'Priority offers']
  },
  [StudentTier.JUNIOR]: {
    minCoins: 1500,
    multiplier: 2.0,
    badge: 'JUNIOR',
    perks: ['10% extra coins', 'Early access']
  },
  [StudentTier.SENIOR]: {
    minCoins: 3000,
    multiplier: 2.5,
    badge: 'SENIOR',
    perks: ['15% extra coins', 'VIP support']
  },
  [StudentTier.SCHOLAR]: {
    minCoins: 5000,
    multiplier: 3.0,
    badge: 'SCHOLAR',
    perks: ['20% extra coins', 'Concierge service']
  }
};

export interface StudentMissionConfig {
  id: string;
  title: string;
  description: string;
  coins: number;
  target: number;
  type: string;
  expiresIn?: number;
  seasonal?: boolean;
}

export const STUDENT_MISSIONS: StudentMissionConfig[] = [
  {
    id: 'first_student_order',
    title: 'First Bite',
    description: 'Complete your first order as a verified student',
    coins: 100,
    target: 1,
    type: 'order_count'
  },
  {
    id: 'refer_5_classmates',
    title: 'Study Group Builder',
    description: 'Refer 5 classmates to join REZ',
    coins: 500,
    target: 5,
    type: 'referral_count'
  },
  {
    id: 'campus_explorer',
    title: 'Campus Explorer',
    description: 'Order from 3 different campus merchants',
    coins: 200,
    target: 3,
    type: 'unique_merchant_count'
  },
  {
    id: 'exam_week_survivor',
    title: 'Exam Week Survivor',
    description: 'Complete 5 orders during exam season',
    coins: 300,
    target: 5,
    type: 'order_count',
    expiresIn: 14
  },
  {
    id: 'graduation_gold',
    title: 'Golden Graduate',
    description: 'Reach Scholar tier',
    coins: 1000,
    target: 1,
    type: 'tier_reached'
  },
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Place 10 orders before 10 AM',
    coins: 50,
    target: 10,
    type: 'early_order_count'
  },
  {
    id: 'social_shopper',
    title: 'Social Shopper',
    description: 'Share 5 deals with friends',
    coins: 150,
    target: 5,
    type: 'share_count'
  }
];

// Leaderboard query interface with userId
export interface LeaderboardQuery {
  period: 'weekly' | 'monthly' | 'all_time';
  page?: number;
  limit?: number;
  userId?: string;
}
