import { CampusPartner, Institution, StudentTransaction } from '../models';
import { OfferType, PartnershipStatus } from '../types';
import { logger } from '../config/logger';
import axios from 'axios';

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:4006';
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || 'http://localhost:4004';

export class CampusPartnershipService {
  async createPartnership(params: {
    merchantId: string;
    institutionIds: string[];
    offerType: OfferType;
    discountValue: number;
    minOrderValue?: number;
    maxDiscount?: number;
    dailyLimit?: number;
    studentVerificationRequired?: boolean;
    terms?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    // Validate institutions exist
    const institutions = await Institution.find({
      _id: { $in: params.institutionIds }
    });

    if (institutions.length !== params.institutionIds.length) {
      throw new Error('Some institutions not found');
    }

    // Check for existing partnership with same merchant
    const existing = await CampusPartner.findOne({
      merchantId: params.merchantId,
      institutionIds: { $in: params.institutionIds },
      status: { $ne: PartnershipStatus.REJECTED }
    });

    if (existing) {
      throw new Error('Partnership already exists with these institutions');
    }

    const partnership = new CampusPartner({
      merchantId: params.merchantId,
      institutionIds: params.institutionIds,
      offerType: params.offerType,
      discountValue: params.discountValue,
      minOrderValue: params.minOrderValue || 0,
      maxDiscount: params.maxDiscount,
      dailyLimit: params.dailyLimit,
      studentVerificationRequired: params.studentVerificationRequired !== false,
      status: PartnershipStatus.PENDING,
      terms: params.terms,
      startDate: params.startDate || new Date(),
      endDate: params.endDate
    });

    await partnership.save();

    logger.info(`Campus partnership created`, {
      partnershipId: partnership._id,
      merchantId: params.merchantId,
      institutions: params.institutionIds.length
    });

    return this.formatPartnershipResponse(partnership, institutions);
  }

  async approvePartnership(partnershipId: string, adminId: string): Promise<void> {
    const partnership = await CampusPartner.findById(partnershipId);

    if (!partnership) {
      throw new Error('Partnership not found');
    }

    if (partnership.status !== PartnershipStatus.PENDING) {
      throw new Error('Partnership is not pending');
    }

    partnership.status = PartnershipStatus.ACTIVE;
    await partnership.save();

    // Notify merchant
    await this.notifyMerchant(partnership.merchantId, {
      type: 'partnership_approved',
      partnershipId: partnership._id,
      institutions: partnership.institutionIds.length
    });

    logger.info(`Partnership approved`, {
      partnershipId,
      approvedBy: adminId
    });
  }

  async rejectPartnership(params: {
    partnershipId: string;
    adminId: string;
    reason: string;
  }): Promise<void> {
    const partnership = await CampusPartner.findById(params.partnershipId);

    if (!partnership) {
      throw new Error('Partnership not found');
    }

    partnership.status = PartnershipStatus.REJECTED;
    await partnership.save();

    await this.notifyMerchant(partnership.merchantId, {
      type: 'partnership_rejected',
      partnershipId: partnership._id,
      reason: params.reason
    });

    logger.info(`Partnership rejected`, {
      partnershipId: params.partnershipId,
      reason: params.reason
    });
  }

  async getPartnerships(params: {
    merchantId?: string;
    institutionId?: string;
    status?: PartnershipStatus;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const query: any = {};

    if (params.merchantId) {
      query.merchantId = params.merchantId;
    }
    if (params.institutionId) {
      query.institutionIds = params.institutionId;
    }
    if (params.status) {
      query.status = params.status;
    }

    const page = params.page || 1;
    const limit = params.limit || 20;

    const [partnerships, total] = await Promise.all([
      CampusPartner.find(query)
        .populate('merchantId', 'name logo')
        .populate('institutionIds', 'name shortName city')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CampusPartner.countDocuments(query)
    ]);

    return {
      partnerships: partnerships.map(p => this.formatPartnershipResponse(p)),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getPartnershipForStudent(params: {
    institutionId: string;
    merchantId?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<any> {
    const query: any = {
      institutionIds: params.institutionId,
      status: PartnershipStatus.ACTIVE,
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gt: new Date() } }
      ]
    };

    if (params.merchantId) {
      query.merchantId = params.merchantId;
    }

    const partnerships = await CampusPartner.find(query)
      .populate('merchantId', 'name logo address rating categories');

    return partnerships.map(p => {
      const merchant = p.merchantId as any;
      return {
        id: p._id,
        merchant: {
          id: merchant._id,
          name: merchant.name,
          logo: merchant.logo,
          rating: merchant.rating,
          categories: merchant.categories,
          address: merchant.address
        },
        offer: this.formatOffer(p),
        verificationRequired: p.studentVerificationRequired,
        dailyLimit: p.dailyLimit,
        remainingToday: p.dailyLimit
          ? p.dailyLimit - p.currentRedemptions
          : null,
        expiresAt: p.endDate
      };
    });
  }

  async getStudentOffers(institutionId: string, params: {
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const page = params.page || 1;
    const limit = params.limit || 20;

    const query: any = {
      institutionIds: institutionId,
      status: PartnershipStatus.ACTIVE,
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gt: new Date() } }
      ]
    };

    const [partnerships, total] = await Promise.all([
      CampusPartner.find(query)
        .populate('merchantId', 'name logo address rating categories imageUrl')
        .sort({ 'stats.totalRedemptions': -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CampusPartner.countDocuments(query)
    ]);

    const offers = partnerships.map(p => {
      const merchant = p.merchantId as any;
      return {
        id: p._id,
        merchantId: merchant._id,
        merchantName: merchant.name,
        merchantLogo: merchant.logo,
        merchantImage: merchant.imageUrl,
        rating: merchant.rating,
        address: merchant.address,
        categories: merchant.categories,
        offer: this.formatOffer(p),
        popular: p.stats.totalRedemptions > 50,
        verified: p.studentVerificationRequired
      };
    });

    // Filter by category if specified
    const filteredOffers = params.category
      ? offers.filter(o => o.categories?.includes(params.category))
      : offers;

    return {
      offers: filteredOffers,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async redeemOffer(params: {
    partnershipId: string;
    studentId: string;
    institutionId: string;
    orderId: string;
    orderAmount: number;
  }): Promise<{
    discount: number;
    studentDiscount: number;
    merchantSavings: number;
  }> {
    const partnership = await CampusPartner.findById(params.partnershipId);

    if (!partnership) {
      throw new Error('Partnership not found');
    }

    if (partnership.status !== PartnershipStatus.ACTIVE) {
      throw new Error('Partnership not active');
    }

    // Check institution
    if (!partnership.institutionIds.some(id => id.toString() === params.institutionId)) {
      throw new Error('Institution not part of partnership');
    }

    // Check daily limit
    if (partnership.dailyLimit && partnership.currentRedemptions >= partnership.dailyLimit) {
      throw new Error('Daily limit reached');
    }

    // Check end date
    if (partnership.endDate && partnership.endDate < new Date()) {
      throw new Error('Partnership expired');
    }

    // Calculate discount
    const discount = this.calculateDiscount(
      partnership.offerType,
      partnership.discountValue,
      params.orderAmount,
      partnership.maxDiscount
    );

    const studentDiscount = partnership.studentVerificationRequired
      ? discount
      : 0;

    // Update partnership stats
    partnership.currentRedemptions += 1;
    partnership.stats.totalRedemptions += 1;
    partnership.stats.totalSavings += discount;
    partnership.stats.lastRedemptionAt = new Date();

    // Track unique students
    const existingStudent = partnership.stats.uniqueStudents;
    await this.trackUniqueStudent(partnership._id, params.studentId);

    await partnership.save();

    // Create transaction record
    const transaction = new StudentTransaction({
      userId: params.studentId,
      institutionId: params.institutionId,
      type: 'order',
      amount: params.orderAmount,
      balance: 0,
      description: `Student discount at merchant`,
      orderId: params.orderId,
      merchantId: partnership.merchantId.toString(),
      studentDiscount,
      coinsEarned: Math.floor(params.orderAmount * 0.05) // 5% back in coins
    });

    await transaction.save();

    logger.info(`Offer redeemed`, {
      partnershipId: params.partnershipId,
      studentId: params.studentId,
      discount,
      orderAmount: params.orderAmount
    });

    return {
      discount,
      studentDiscount,
      merchantSavings: discount - studentDiscount
    };
  }

  async updatePartnership(params: {
    partnershipId: string;
    merchantId: string;
    updates: {
      offerType?: OfferType;
      discountValue?: number;
      minOrderValue?: number;
      maxDiscount?: number;
      dailyLimit?: number;
      studentVerificationRequired?: boolean;
      terms?: string;
      endDate?: Date;
      status?: PartnershipStatus;
    };
  }): Promise<void> {
    const partnership = await CampusPartner.findOne({
      _id: params.partnershipId,
      merchantId: params.merchantId
    });

    if (!partnership) {
      throw new Error('Partnership not found');
    }

    Object.assign(partnership, params.updates);
    await partnership.save();

    logger.info(`Partnership updated`, {
      partnershipId: params.partnershipId,
      updates: Object.keys(params.updates)
    });
  }

  async getPartnershipAnalytics(params: {
    partnershipId: string;
    merchantId: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    const partnership = await CampusPartner.findOne({
      _id: params.partnershipId,
      merchantId: params.merchantId
    });

    if (!partnership) {
      throw new Error('Partnership not found');
    }

    const dateFilter: any = {};
    if (params.startDate) {
      dateFilter.$gte = params.startDate;
    }
    if (params.endDate) {
      dateFilter.$lte = params.endDate;
    }

    const matchStage: any = {
      merchantId: partnership.merchantId.toString(),
      studentDiscount: { $gt: 0 }
    };
    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }

    const analytics = await StudentTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRedemptions: { $sum: 1 },
          totalDiscount: { $sum: '$studentDiscount' },
          totalOrderValue: { $sum: '$amount' },
          uniqueStudents: { $addToSet: '$userId' }
        }
      }
    ]);

    const result = analytics[0] || {
      totalRedemptions: 0,
      totalDiscount: 0,
      totalOrderValue: 0,
      uniqueStudents: []
    };

    return {
      partnership: {
        id: partnership._id,
        status: partnership.status,
        offer: this.formatOffer(partnership)
      },
      stats: {
        totalRedemptions: result.totalRedemptions,
        totalDiscount: result.totalDiscount,
        totalOrderValue: result.totalOrderValue,
        uniqueStudents: result.uniqueStudents.length,
        avgOrderValue: result.totalRedemptions > 0
          ? result.totalOrderValue / result.totalRedemptions
          : 0,
        avgDiscount: result.totalRedemptions > 0
          ? result.totalDiscount / result.totalRedemptions
          : 0
      },
      period: {
        start: params.startDate,
        end: params.endDate
      }
    };
  }

  async getPopularPartners(params: {
    institutionId: string;
    limit?: number;
  }): Promise<any> {
    const limit = params.limit || 10;

    const partnerships = await CampusPartner.find({
      institutionIds: params.institutionId,
      status: PartnershipStatus.ACTIVE
    })
      .populate('merchantId', 'name logo address rating categories imageUrl')
      .sort({ 'stats.totalRedemptions': -1 })
      .limit(limit);

    return partnerships.map(p => {
      const merchant = p.merchantId as any;
      return {
        id: p._id,
        merchant: {
          id: merchant._id,
          name: merchant.name,
          logo: merchant.logo,
          image: merchant.imageUrl,
          rating: merchant.rating,
          categories: merchant.categories,
          address: merchant.address
        },
        offer: this.formatOffer(p),
        redemptions: p.stats.totalRedemptions
      };
    });
  }

  async getTopStudentSaver(institutionId: string, params: {
    limit?: number;
  }): Promise<any> {
    const limit = params.limit || 10;

    const topSavers = await StudentTransaction.aggregate([
      {
        $match: {
          institutionId,
          type: 'order',
          studentDiscount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalSavings: { $sum: '$studentDiscount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalSavings: -1 } },
      { $limit: limit }
    ]);

    return topSavers.map((saver, index) => ({
      rank: index + 1,
      userId: saver._id,
      totalSavings: saver.totalSavings,
      orderCount: saver.orderCount
    }));
  }

  private calculateDiscount(
    offerType: OfferType,
    discountValue: number,
    orderAmount: number,
    maxDiscount?: number
  ): number {
    let discount = 0;

    switch (offerType) {
      case OfferType.PERCENTAGE:
        discount = (orderAmount * discountValue) / 100;
        break;
      case OfferType.FIXED:
        discount = discountValue;
        break;
      case OfferType.FREE_DELIVERY:
        discount = 30; // Flat delivery fee
        break;
      case OfferType.BUY_ONE_GET_ONE:
        discount = Math.floor(orderAmount / 2);
        break;
      default:
        discount = 0;
    }

    if (maxDiscount && discount > maxDiscount) {
      discount = maxDiscount;
    }

    return Math.min(discount, orderAmount);
  }

  private formatOffer(partnership: any): any {
    switch (partnership.offerType) {
      case OfferType.PERCENTAGE:
        return {
          type: 'percentage',
          value: partnership.discountValue,
          display: `${partnership.discountValue}% off`,
          minOrder: partnership.minOrderValue,
          maxDiscount: partnership.maxDiscount
        };
      case OfferType.FIXED:
        return {
          type: 'fixed',
          value: partnership.discountValue,
          display: `₹${partnership.discountValue} off`,
          minOrder: partnership.minOrderValue
        };
      case OfferType.FREE_DELIVERY:
        return {
          type: 'free_delivery',
          display: 'Free delivery'
        };
      case OfferType.BUY_ONE_GET_ONE:
        return {
          type: 'bogo',
          display: 'Buy 1 Get 1'
        };
      default:
        return { type: 'unknown', display: 'Special offer' };
    }
  }

  private formatPartnershipResponse(partnership: any, institutions?: any): any {
    const inst = institutions || partnership.institutionIds;
    return {
      id: partnership._id,
      merchantId: partnership.merchantId,
      institutions: inst,
      offer: this.formatOffer(partnership),
      status: partnership.status,
      startDate: partnership.startDate,
      endDate: partnership.endDate,
      dailyLimit: partnership.dailyLimit,
      studentVerificationRequired: partnership.studentVerificationRequired,
      stats: partnership.stats,
      terms: partnership.terms,
      createdAt: partnership.createdAt
    };
  }

  private async trackUniqueStudent(partnershipId: string, studentId: string): Promise<void> {
    // This is a simplified implementation
    // In production, maintain a separate unique students collection
    await CampusPartner.updateOne(
      { _id: partnershipId },
      { $addToSet: { _uniqueStudents: studentId } }
    );
  }

  private async notifyMerchant(merchantId: string, data: any): Promise<void> {
    try {
      await axios.post(`${process.env.NOTIFICATION_SERVICE_URL}/send`, {
        userId: merchantId,
        type: 'push',
        title: data.type === 'partnership_approved'
          ? 'Campus Partnership Active!'
          : 'Partnership Update',
        body: data.type === 'partnership_approved'
          ? `Your deals are now live for ${data.institutions} campus(es)`
          : 'Your partnership status has been updated',
        data
      });
    } catch (error) {
      logger.error('Failed to notify merchant', { error });
    }
  }
}

export const campusPartnershipService = new CampusPartnershipService();
