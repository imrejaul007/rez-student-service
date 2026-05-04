import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { verificationService } from '../services/verificationService';
import { studentWalletService } from '../services/studentWalletService';
import { studentGamificationService } from '../services/studentGamificationService';
import { campusPartnershipService } from '../services/campusPartnershipService';
import { studentPricingService } from '../services/studentPricingService';
import { Institution, StudentProfile } from '../models';
import { DocumentType } from '../types';

const router = Router();

// Multer config for document upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF allowed.'));
    }
  }
});

// ==================== VERIFICATION ROUTES ====================

/**
 * Submit student verification
 * POST /api/student/verify
 */
router.post('/verify', upload.single('document'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, institutionId, studentIdNumber, documentType, email } = req.body;

    if (!userId || !institutionId || !studentIdNumber || !documentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Document required' });
    }

    const result = await verificationService.submitVerification({
      userId,
      institutionId,
      studentIdNumber,
      documentType: documentType as DocumentType,
      documentBuffer: req.file.buffer,
      documentMimeType: req.file.mimetype,
      email,
      metadata: {
        ipAddress: req.ip,
        deviceInfo: req.get('user-agent')
      }
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get verification status
 * GET /api/student/verification-status
 */
router.get('/verification-status', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const status = await verificationService.checkVerificationStatus(userId as string);
    res.json(status);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get pending verifications (admin)
 * GET /api/admin/student-verifications
 */
router.get('/admin/verifications', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', institutionId } = req.query;

    const result = await verificationService.getPendingVerifications({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      institutionId: institutionId as string
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Approve verification (admin)
 * POST /api/admin/verifications/:id/approve
 */
router.post('/admin/verifications/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({ error: 'adminId required' });
    }

    await verificationService.approveVerification(id, adminId);
    res.json({ success: true, message: 'Verification approved' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Reject verification (admin)
 * POST /api/admin/verifications/:id/reject
 */
router.post('/admin/verifications/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminId, reason } = req.body;

    if (!adminId || !reason) {
      return res.status(400).json({ error: 'adminId and reason required' });
    }

    await verificationService.rejectVerification(id, adminId, reason);
    res.json({ success: true, message: 'Verification rejected' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== INSTITUTION ROUTES ====================

/**
 * Search institutions
 * GET /api/student/institutions
 */
router.get('/institutions', async (req: Request, res: Response) => {
  try {
    const { search, type, city, page = '1', limit = '20' } = req.query;

    const query: any = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } }
      ];
    }

    if (type) {
      query.type = type;
    }

    if (city) {
      query['address.city'] = { $regex: city, $options: 'i' };
    }

    const institutions = await Institution.find(query)
      .select('name shortName type domain address stats')
      .sort({ name: 1 })
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string));

    const total = await Institution.countDocuments(query);

    res.json({
      institutions,
      total,
      page: parseInt(page as string),
      totalPages: Math.ceil(total / parseInt(limit as string))
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== WALLET ROUTES ====================

/**
 * Get student wallet
 * GET /api/student/wallet
 */
router.get('/wallet', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const wallet = await studentWalletService.getWallet(userId as string);
    res.json(wallet);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Request funding from parent
 * POST /api/student/wallet/request-funding
 */
router.post('/wallet/request-funding', async (req: Request, res: Response) => {
  try {
    const { studentId, parentId, amount, reason } = req.body;

    if (!studentId || !parentId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await studentWalletService.requestFunding({
      studentId,
      parentId,
      amount,
      reason
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Approve funding request (parent)
 * POST /api/student/wallet/approve-funding
 */
router.post('/wallet/approve-funding', async (req: Request, res: Response) => {
  try {
    const { requestId, parentId, note } = req.body;

    if (!requestId || !parentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await studentWalletService.approveFunding({
      requestId,
      parentId,
      note
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Link parent to student wallet
 * POST /api/student/wallet/link-parent
 */
router.post('/wallet/link-parent', async (req: Request, res: Response) => {
  try {
    const { studentId, parentId, relationship, monthlyLimit, spendingLimitPerTransaction } = req.body;

    if (!studentId || !parentId || !relationship) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await studentWalletService.linkParent({
      studentId,
      parentId,
      relationship,
      monthlyLimit,
      spendingLimitPerTransaction
    });

    res.json({ success: true, message: 'Parent linked successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get budget summary
 * GET /api/student/budget
 */
router.get('/budget', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const budget = await studentWalletService.getBudgetSummary(userId as string);
    res.json(budget);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Set budget
 * POST /api/student/budget
 */
router.post('/budget', async (req: Request, res: Response) => {
  try {
    const { userId, institutionId, monthlyBudget, categories, alertThreshold } = req.body;

    if (!userId || !institutionId || !monthlyBudget) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await studentWalletService.setBudget(userId, institutionId, {
      monthlyBudget,
      categories,
      alertThreshold
    });

    res.json({ success: true, message: 'Budget set successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== GAMIFICATION ROUTES ====================

/**
 * Get student profile
 * GET /api/student/profile
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const profile = await studentGamificationService.getStudentProfile(userId as string);
    res.json(profile);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get available missions
 * GET /api/student/missions
 */
router.get('/missions', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const missions = await studentGamificationService.getAvailableMissions(userId as string);
    res.json({ missions });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Claim mission reward
 * POST /api/student/missions/:id/claim
 */
router.post('/missions/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const result = await studentGamificationService.claimMissionReward({
      userId,
      missionId: id
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get campus leaderboard
 * GET /api/student/leaderboard/:institutionId
 */
router.get('/leaderboard/:institutionId', async (req: Request, res: Response) => {
  try {
    const { institutionId } = req.params;
    const { period = 'weekly', page = '1', limit = '10', userId } = req.query;

    const leaderboard = await studentGamificationService.getCampusLeaderboard(institutionId, {
      period: period as 'weekly' | 'monthly' | 'all_time',
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      userId: userId as string
    });

    res.json(leaderboard);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get user rank
 * GET /api/student/rank/:institutionId
 */
router.get('/rank/:institutionId', async (req: Request, res: Response) => {
  try {
    const { institutionId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const rank = await studentGamificationService.getUserRank(userId as string, institutionId);
    res.json(rank);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== CAMPUS PARTNERSHIP ROUTES ====================

/**
 * Create campus partnership (merchant)
 * POST /api/student/partnerships
 */
router.post('/partnerships', async (req: Request, res: Response) => {
  try {
    const result = await campusPartnershipService.createPartnership(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get merchant partnerships
 * GET /api/student/partnerships
 */
router.get('/partnerships', async (req: Request, res: Response) => {
  try {
    const { merchantId, status, page = '1', limit = '20' } = req.query;

    const result = await campusPartnershipService.getPartnerships({
      merchantId: merchantId as string,
      status: status as any,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get student offers at institution
 * GET /api/student/offers/:institutionId
 */
router.get('/offers/:institutionId', async (req: Request, res: Response) => {
  try {
    const { institutionId } = req.params;
    const { category, page = '1', limit = '20' } = req.query;

    const result = await campusPartnershipService.getStudentOffers(institutionId, {
      category: category as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get popular campus partners
 * GET /api/student/popular/:institutionId
 */
router.get('/popular/:institutionId', async (req: Request, res: Response) => {
  try {
    const { institutionId } = req.params;
    const { limit = '10' } = req.query;

    const result = await campusPartnershipService.getPopularPartners({
      institutionId,
      limit: parseInt(limit as string)
    });

    res.json({ partners: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get top student savers
 * GET /api/student/top-savers/:institutionId
 */
router.get('/top-savers/:institutionId', async (req: Request, res: Response) => {
  try {
    const { institutionId } = req.params;
    const { limit = '10' } = req.query;

    const result = await campusPartnershipService.getTopStudentSaver(institutionId, {
      limit: parseInt(limit as string)
    });

    res.json({ topSavers: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Redeem offer
 * POST /api/student/redeem
 */
router.post('/redeem', async (req: Request, res: Response) => {
  try {
    const { partnershipId, studentId, institutionId, orderId, orderAmount } = req.body;

    if (!partnershipId || !studentId || !institutionId || !orderId || !orderAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await campusPartnershipService.redeemOffer({
      partnershipId,
      studentId,
      institutionId,
      orderId,
      orderAmount
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== PRICING ROUTES ====================

/**
 * Calculate student price
 * POST /api/student/price
 */
router.post('/price', async (req: Request, res: Response) => {
  try {
    const { productId, userId, basePrice, quantity } = req.body;

    if (!productId || !userId || !basePrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await studentPricingService.calculateStudentPrice({
      productId,
      userId,
      basePrice,
      quantity
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get affordable options for students
 * GET /api/student/affordable
 */
router.get('/affordable', async (req: Request, res: Response) => {
  try {
    const { maxPrice, categoryId, institutionId, page = '1', limit = '20' } = req.query;

    const result = await studentPricingService.getAffordableOptions({
      maxPrice: parseFloat(maxPrice as string),
      categoryId: categoryId as string,
      institutionId: institutionId as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Calculate cart discount
 * POST /api/student/cart-discount
 */
router.post('/cart-discount', async (req: Request, res: Response) => {
  try {
    const { userId, items } = req.body;

    if (!userId || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await studentPricingService.calculateCartDiscount({
      userId,
      items
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== REFERRAL ROUTES ====================

/**
 * Apply referral code
 * POST /api/student/referral/apply
 */
router.post('/referral/apply', async (req: Request, res: Response) => {
  try {
    const { userId, referralCode } = req.body;

    if (!userId || !referralCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find student by referral code
    const referrer = await StudentProfile.findOne({ referralCode });

    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Update current user's referredBy
    await StudentProfile.updateOne(
      { userId },
      { $set: { referredBy: referrer.userId } }
    );

    // Increment referrer's count
    await StudentProfile.updateOne(
      { _id: referrer._id },
      { $inc: { referralsCount: 1 } }
    );

    res.json({
      success: true,
      message: 'Referral code applied successfully',
      referrerName: 'Your friend'
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
