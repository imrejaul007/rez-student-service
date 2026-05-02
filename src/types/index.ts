import mongoose, { Schema, Document } from 'mongoose';

// Student Verification Types
export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  PROVISIONAL = 'provisional'
}

export enum DocumentType {
  ID_CARD = 'id_card',
  ADMIT_CARD = 'admit_card',
  BONAFIDE = 'bonafide',
  AADHAR = 'aadhar',
  PASSPORT = 'passport'
}

export enum VerificationMethod {
  AUTO = 'auto',
  MANUAL = 'manual',
  HYBRID = 'hybrid'
}

export interface IStudentVerification extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  studentIdNumber: string;
  documentType: DocumentType;
  documentUrl: string;
  documentId?: string; // Last 4 digits of ID
  status: VerificationStatus;
  submittedAt: Date;
  verifiedAt?: Date;
  expiresAt: Date;
  verificationMethod: VerificationMethod;
  verifiedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  autoVerificationScore?: number;
  metadata: {
    ipAddress?: string;
    deviceInfo?: string;
    browserFingerprint?: string;
  };
  verificationHistory: {
    status: VerificationStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    reason?: string;
  }[];
}

// Institution Types
export enum InstitutionType {
  UNIVERSITY = 'university',
  COLLEGE = 'college',
  SCHOOL = 'school',
  INSTITUTE = 'institute'
}

export interface IInstitution extends Document {
  name: string;
  shortName: string;
  type: InstitutionType;
  domain: string; // e.g., 'iitd.ac.in'
  logo?: string;
  address: {
    street?: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
    coordinates?: {
      type: 'Point';
      coordinates: [number, number]; // [lng, lat]
    };
  };
  contact: {
    email?: string;
    phone?: string;
  };
  verificationConfig: {
    allowAutoVerification: boolean;
    requireDocumentUpload: boolean;
    acceptedDocumentTypes: DocumentType[];
    autoVerifyDomains: string[];
  };
  partnership: {
    status: 'none' | 'pending' | 'active' | 'expired';
    partnerSince?: Date;
    expiresAt?: Date;
    contractUrl?: string;
  };
  stats: {
    totalStudents: number;
    verifiedStudents: number;
    activeStudents: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Student Wallet Types
export interface IStudentWallet extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  verificationId: mongoose.Types.ObjectId;
  studentCash: {
    balance: number;
    fundedBy: mongoose.Types.ObjectId[]; // Parent user IDs
    monthlyAllowance?: number;
    spentThisMonth: number;
    budgetAlertAt?: number; // Percentage (e.g., 80)
    lastResetAt: Date;
  };
  parentConnections: {
    parentId: mongoose.Types.ObjectId;
    relationship: 'mother' | 'father' | 'guardian' | 'other';
    linkedAt: Date;
    monthlyLimit?: number;
    spendingLimitPerTransaction?: number;
    status: 'active' | 'paused' | 'removed';
  }[];
  status: 'active' | 'suspended' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

// Funding Request Types
export enum FundingRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface IFundingRequest extends Document {
  studentId: mongoose.Types.ObjectId;
  parentId: mongoose.Types.ObjectId;
  amount: number;
  reason?: string;
  status: FundingRequestStatus;
  requestedAt: Date;
  respondedAt?: Date;
  responseNote?: string;
  transactionId?: mongoose.Types.ObjectId;
}

// Student Budget Types
export interface IStudentBudget extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  monthlyBudget: number;
  categories: {
    name: string;
    limit: number;
    spent: number;
    alerts: boolean;
  }[];
  alerts: {
    threshold: number; // Percentage
    notifiedAt?: Date;
  }[];
  rolloverUnused: boolean;
  rolloverLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

// Campus Partner Types
export enum OfferType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  BUNDLE = 'bundle',
  FREE_DELIVERY = 'free_delivery',
  BUY_ONE_GET_ONE = 'bogo'
}

export enum PartnershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAUSED = 'paused',
  EXPIRED = 'expired',
  REJECTED = 'rejected'
}

export interface ICampusPartner extends Document {
  merchantId: mongoose.Types.ObjectId;
  institutionIds: mongoose.Types.ObjectId[];
  offerType: OfferType;
  discountValue: number; // Percentage or fixed amount
  minOrderValue?: number;
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
  createdAt: Date;
  updatedAt: Date;
}

// Student Tier Types
export enum StudentTier {
  FRESHMAN = 'freshman',
  SOPHOMORE = 'sophomore',
  JUNIOR = 'junior',
  SENIOR = 'senior',
  SCHOLAR = 'scholar'
}

export const STUDENT_TIER_CONFIG: Record<StudentTier, {
  minCoins: number;
  multiplier: number;
  badge: string;
  color: string;
  perks: string[];
}> = {
  [StudentTier.FRESHMAN]: {
    minCoins: 0,
    multiplier: 1.5,
    badge: 'FRESHMEN',
    color: '#8B5CF6', // Purple
    perks: ['5% extra coins', 'Basic offers']
  },
  [StudentTier.SOPHOMORE]: {
    minCoins: 500,
    multiplier: 1.75,
    badge: 'SOPHOMORE',
    color: '#3B82F6', // Blue
    perks: ['7% extra coins', 'Priority offers', 'Exclusive deals']
  },
  [StudentTier.JUNIOR]: {
    minCoins: 1500,
    multiplier: 2.0,
    badge: 'JUNIOR',
    color: '#10B981', // Green
    perks: ['10% extra coins', 'Early access', 'Premium deals']
  },
  [StudentTier.SENIOR]: {
    minCoins: 3000,
    multiplier: 2.5,
    badge: 'SENIOR',
    color: '#F59E0B', // Amber
    perks: ['15% extra coins', 'VIP support', 'Beta features']
  },
  [StudentTier.SCHOLAR]: {
    minCoins: 5000,
    multiplier: 3.0,
    badge: 'SCHOLAR',
    color: '#EF4444', // Red
    perks: ['20% extra coins', 'Personal concierge', 'Influencer badge']
  }
};

export interface IStudentProfile extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  verificationId: mongoose.Types.ObjectId;
  tier: StudentTier;
  lifetimeCoins: number;
  currentCoins: number;
  totalOrders: number;
  totalSavings: number;
  missionsCompleted: string[];
  achievements: {
    id: string;
    earnedAt: Date;
  }[];
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referralsCount: number;
  campusRank?: number;
  institutionRank?: number;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Student Missions Types
export enum MissionStatus {
  AVAILABLE = 'available',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  EXPIRED = 'expired'
}

export interface IStudentMission extends Document {
  userId: mongoose.Types.ObjectId;
  missionId: string;
  status: MissionStatus;
  progress: number;
  target: number;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  rewardClaimed: boolean;
}

export const STUDENT_MISSIONS = [
  {
    id: 'first_student_order',
    title: 'First Bite',
    description: 'Complete your first order as a student',
    coins: 100,
    target: 1,
    type: 'order_count',
    expiresIn: 30 // days
  },
  {
    id: 'refer_5_classmates',
    title: 'Study Group Builder',
    description: 'Refer 5 classmates to join',
    coins: 500,
    target: 5,
    type: 'referral_count',
    expiresIn: 90
  },
  {
    id: 'campus_explorer',
    title: 'Campus Explorer',
    description: 'Order from 3 different campus partners',
    coins: 200,
    target: 3,
    type: 'unique_merchant_count',
    expiresIn: 60
  },
  {
    id: 'exam_week_survivor',
    title: 'Exam Week Survivor',
    description: 'Order during exam season',
    coins: 300,
    target: 5,
    type: 'order_count',
    expiresIn: 14,
    seasonal: true
  },
  {
    id: 'graduation_gold',
    title: 'Golden Graduate',
    description: 'Reach Scholar tier before graduation',
    coins: 1000,
    target: 1,
    type: 'tier_reached',
    tierRequired: StudentTier.SCHOLAR,
    expiresIn: 365
  },
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Order before 9 AM',
    coins: 50,
    target: 10,
    type: 'early_order_count',
    expiresIn: 30
  },
  {
    id: 'social_shopper',
    title: 'Social Shopper',
    description: 'Share 5 deals on social media',
    coins: 150,
    target: 5,
    type: 'social_share_count',
    expiresIn: 30
  }
];

// Leaderboard Types
export interface IStudentLeaderboard extends Document {
  institutionId: mongoose.Types.ObjectId;
  period: 'weekly' | 'monthly' | 'all_time';
  rankings: {
    userId: mongoose.Types.ObjectId;
    coins: number;
    tier: StudentTier;
    lastUpdated: Date;
  }[];
  lastCalculatedAt: Date;
}

// Campus Ambassador Types
export interface ICampusAmbassador extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
}

// Transaction Types
export interface IStudentTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  type: 'order' | 'funding' | 'refund' | 'bonus' | 'redemption';
  amount: number;
  balance: number;
  description: string;
  orderId?: mongoose.Types.ObjectId;
  fundingRequestId?: mongoose.Types.ObjectId;
  merchantId?: mongoose.Types.ObjectId;
  category?: string;
  coinsEarned?: number;
  studentDiscount?: number;
  createdAt: Date;
}
