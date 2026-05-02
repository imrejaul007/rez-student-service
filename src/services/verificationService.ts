import { v4 as uuidv4 } from 'uuid';
import { Cloudinary } from 'cloudinary';
import { StudentVerification, Institution, StudentProfile, StudentWallet, StudentMission } from '../models';
import {
  VerificationStatus,
  DocumentType,
  VerificationMethod,
  StudentTier,
  STUDENT_MISSIONS
} from '../types';
import { logger } from '../config/logger';

export class VerificationService {
  private cloudinary: typeof Cloudinary;

  constructor() {
    this.cloudinary = new Cloudinary({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    }) as any;
  }

  async submitVerification(params: {
    userId: string;
    institutionId: string;
    studentIdNumber: string;
    documentType: DocumentType;
    documentBuffer: Buffer;
    documentMimeType: string;
    email?: string;
    metadata?: {
      ipAddress?: string;
      deviceInfo?: string;
      browserFingerprint?: string;
    };
  }): Promise<{
    verificationId: string;
    status: VerificationStatus;
    requiresManualReview: boolean;
    message: string;
  }> {
    try {
      // Check if institution exists
      const institution = await Institution.findById(params.institutionId);
      if (!institution) {
        throw new Error('Institution not found');
      }

      // Check for existing verification
      const existing = await StudentVerification.findOne({
        userId: params.userId,
        status: { $in: [VerificationStatus.PENDING, VerificationStatus.VERIFIED] }
      });

      if (existing) {
        if (existing.status === VerificationStatus.VERIFIED) {
          throw new Error('Already verified');
        }
        throw new Error('Verification already in progress');
      }

      // Upload document to Cloudinary
      const documentUrl = await this.uploadDocument(
        params.documentBuffer,
        params.documentMimeType,
        params.userId
      );

      // Calculate expiration (end of academic year + 1 month buffer)
      const expiresAt = this.calculateExpirationDate();

      // Try auto-verification
      const autoVerificationResult = await this.tryAutoVerification(params, institution);

      const verification = new StudentVerification({
        userId: params.userId,
        institutionId: params.institutionId,
        studentIdNumber: params.studentIdNumber,
        documentType: params.documentType,
        documentUrl,
        documentId: params.studentIdNumber.slice(-4), // Last 4 digits
        status: autoVerificationResult.verified
          ? VerificationStatus.VERIFIED
          : VerificationStatus.PENDING,
        submittedAt: new Date(),
        expiresAt,
        verificationMethod: autoVerificationResult.verified
          ? VerificationMethod.AUTO
          : VerificationMethod.MANUAL,
        autoVerificationScore: autoVerificationResult.score,
        metadata: params.metadata || {}
      });

      await verification.save();

      if (autoVerificationResult.verified) {
        // Create student profile and wallet
        await this.createStudentAccount(verification);
      }

      logger.info(`Verification submitted for user ${params.userId}`, {
        verificationId: verification._id,
        status: verification.status,
        autoVerified: autoVerificationResult.verified
      });

      return {
        verificationId: verification._id.toString(),
        status: verification.status,
        requiresManualReview: !autoVerificationResult.verified,
        message: autoVerificationResult.verified
          ? 'Verification successful! Welcome to student zone.'
          : 'Document submitted. Verification in progress.'
      };
    } catch (error) {
      logger.error('Verification submission failed', { error, params });
      throw error;
    }
  }

  private async uploadDocument(
    buffer: Buffer,
    mimeType: string,
    userId: string
  ): Promise<string> {
    try {
      const folder = `student-verifications/${new Date().getFullYear()}`;
      const publicId = `doc_${userId}_${uuidv4()}`;

      // For now, we'll use a simple file system storage
      // In production, use Cloudinary/S3
      const base64 = buffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;

      // In production, upload to Cloudinary:
      // const result = await cloudinary.uploader.upload(dataUri, {
      //   folder,
      //   public_id: publicId,
      //   resource_type: 'auto'
      // });
      // return result.secure_url;

      // For demo, return placeholder
      return `https://storage.rez.money/${folder}/${publicId}.pdf`;
    } catch (error) {
      logger.error('Document upload failed', { error });
      throw new Error('Failed to upload document');
    }
  }

  private async tryAutoVerification(
    params: { email?: string; institutionId: string; studentIdNumber: string },
    institution: any
  ): Promise<{ verified: boolean; score: number }> {
    let score = 0;

    // Check domain email verification
    if (params.email && institution.domain) {
      const emailDomain = params.email.split('@')[1];
      if (emailDomain === institution.domain) {
        score += 40;
      }
      if (institution.verificationConfig.autoVerifyDomains.includes(emailDomain)) {
        score += 20;
      }
    }

    // Check institution auto-verification config
    if (institution.verificationConfig.allowAutoVerification) {
      score += 20;
    }

    // Check document type
    if (params.documentType === DocumentType.AADHAR) {
      score += 10;
    } else if (params.documentType === DocumentType.PASSPORT) {
      score += 15;
    }

    // Student ID format validation
    const studentIdRegex = /^[A-Z0-9]{5,15}$/i;
    if (studentIdRegex.test(params.studentIdNumber)) {
      score += 10;
    }

    return {
      verified: score >= 70,
      score
    };
  }

  private calculateExpirationDate(): Date {
    const now = new Date();
    // Expire at end of academic year (typically May/June in India)
    const expiration = new Date(now.getFullYear(), 5, 30); // June 30
    if (now > expiration) {
      expiration.setFullYear(expiration.getFullYear() + 1);
    }
    return expiration;
  }

  async createStudentAccount(verification: any): Promise<void> {
    // Create student profile
    const referralCode = this.generateReferralCode();

    const profile = new StudentProfile({
      userId: verification.userId,
      institutionId: verification.institutionId,
      verificationId: verification._id,
      tier: StudentTier.FRESHMAN,
      referralCode,
      lastActiveAt: new Date()
    });

    await profile.save();

    // Create student wallet
    const wallet = new StudentWallet({
      userId: verification.userId,
      institutionId: verification.institutionId,
      verificationId: verification._id
    });

    await wallet.save();

    // Assign available missions
    await this.assignMissions(verification.userId);

    // Update institution stats
    await Institution.updateOne(
      { _id: verification.institutionId },
      {
        $inc: { 'stats.totalStudents': 1, 'stats.verifiedStudents': 1 }
      }
    );

    logger.info(`Student account created for user ${verification.userId}`);
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'STU';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private async assignMissions(userId: string): Promise<void> {
    const missionsToAssign = STUDENT_MISSIONS.filter(m => !m.seasonal).slice(0, 5);

    for (const mission of missionsToAssign) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (mission.expiresIn || 30));

      const studentMission = new StudentMission({
        userId,
        missionId: mission.id,
        status: 'available',
        progress: 0,
        target: mission.target,
        expiresAt
      });

      await studentMission.save();
    }
  }

  async approveVerification(
    verificationId: string,
    adminId: string
  ): Promise<void> {
    const verification = await StudentVerification.findById(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new Error('Verification is not pending');
    }

    verification.status = VerificationStatus.VERIFIED;
    verification.verifiedAt = new Date();
    verification.verifiedBy = adminId;
    verification.verificationMethod = VerificationMethod.MANUAL;
    verification.verificationHistory.push({
      status: VerificationStatus.VERIFIED,
      changedAt: new Date(),
      changedBy: adminId,
      reason: 'Manually approved by admin'
    });

    await verification.save();

    await this.createStudentAccount(verification);

    logger.info(`Verification ${verificationId} approved by admin ${adminId}`);
  }

  async rejectVerification(
    verificationId: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    const verification = await StudentVerification.findById(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    verification.status = VerificationStatus.REJECTED;
    verification.rejectionReason = reason;
    verification.verificationHistory.push({
      status: VerificationStatus.REJECTED,
      changedAt: new Date(),
      changedBy: adminId,
      reason
    });

    await verification.save();

    logger.info(`Verification ${verificationId} rejected`, { reason });
  }

  async getPendingVerifications(params: {
    page: number;
    limit: number;
    institutionId?: string;
  }): Promise<{
    verifications: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query: any = { status: VerificationStatus.PENDING };
    if (params.institutionId) {
      query.institutionId = params.institutionId;
    }

    const [verifications, total] = await Promise.all([
      StudentVerification.find(query)
        .populate('userId', 'name phone email')
        .populate('institutionId', 'name shortName domain')
        .sort({ submittedAt: -1 })
        .skip((params.page - 1) * params.limit)
        .limit(params.limit),
      StudentVerification.countDocuments(query)
    ]);

    return {
      verifications,
      total,
      page: params.page,
      totalPages: Math.ceil(total / params.limit)
    };
  }

  async checkVerificationStatus(userId: string): Promise<{
    isVerified: boolean;
    verification?: any;
    tier?: StudentTier;
  }> {
    const verification = await StudentVerification.findOne({
      userId,
      status: VerificationStatus.VERIFIED
    }).sort({ verifiedAt: -1 });

    if (!verification) {
      return { isVerified: false };
    }

    // Check if expired
    if (verification.expiresAt < new Date()) {
      verification.status = VerificationStatus.EXPIRED;
      await verification.save();
      return { isVerified: false };
    }

    const profile = await StudentProfile.findOne({ userId });

    return {
      isVerified: true,
      verification: {
        id: verification._id,
        institution: verification.institutionId,
        status: verification.status,
        expiresAt: verification.expiresAt
      },
      tier: profile?.tier
    };
  }
}

export const verificationService = new VerificationService();
