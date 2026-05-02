import axios from 'axios';
import { logger } from '../config/logger';

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:4006';

interface StudentPricingConfig {
  hasStudentDiscount: boolean;
  studentDiscountPercent: number;
  studentPrice?: number;
  minStudentPrice?: number;
  campusExclusive?: string[];
  validFrom?: Date;
  validUntil?: Date;
}

interface PriceCalculation {
  originalPrice: number;
  studentPrice: number;
  discount: number;
  discountPercent: number;
  isEligible: boolean;
  reason?: string;
}

export class StudentPricingService {
  async calculateStudentPrice(params: {
    productId: string;
    userId: string;
    basePrice: number;
    quantity?: number;
  }): Promise<PriceCalculation> {
    try {
      // Get student verification status
      const verificationStatus = await this.checkStudentVerification(params.userId);

      if (!verificationStatus.isVerified) {
        return {
          originalPrice: params.basePrice,
          studentPrice: params.basePrice,
          discount: 0,
          discountPercent: 0,
          isEligible: false,
          reason: 'Student not verified'
        };
      }

      // Get product student pricing config
      const pricingConfig = await this.getProductPricingConfig(params.productId);

      if (!pricingConfig) {
        // No specific config, apply default discount
        const defaultDiscount = 5; // 5% default student discount
        const discount = Math.floor(params.basePrice * defaultDiscount / 100);
        const studentPrice = params.basePrice - discount;

        return {
          originalPrice: params.basePrice,
          studentPrice,
          discount,
          discountPercent: defaultDiscount,
          isEligible: true,
          reason: 'Default student discount'
        };
      }

      // Check date validity
      const now = new Date();
      if (pricingConfig.validFrom && pricingConfig.validFrom > now) {
        return {
          originalPrice: params.basePrice,
          studentPrice: params.basePrice,
          discount: 0,
          discountPercent: 0,
          isEligible: false,
          reason: 'Student pricing not yet active'
        };
      }

      if (pricingConfig.validUntil && pricingConfig.validUntil < now) {
        return {
          originalPrice: params.basePrice,
          studentPrice: params.basePrice,
          discount: 0,
          discountPercent: 0,
          isEligible: false,
          reason: 'Student pricing expired'
        };
      }

      // Calculate discount
      let studentPrice: number;

      if (pricingConfig.studentPrice) {
        // Fixed student price
        studentPrice = pricingConfig.studentPrice;
      } else {
        // Percentage discount
        const discountAmount = params.basePrice * pricingConfig.studentDiscountPercent / 100;
        studentPrice = params.basePrice - discountAmount;
      }

      // Apply minimum price floor
      if (pricingConfig.minStudentPrice && studentPrice < pricingConfig.minStudentPrice) {
        studentPrice = pricingConfig.minStudentPrice;
      }

      // Apply maximum discount cap
      const discount = params.basePrice - studentPrice;
      const discountPercent = (discount / params.basePrice) * 100;

      const isEligible = pricingConfig.campusExclusive
        ? pricingConfig.campusExclusive.includes(verificationStatus.institutionId)
        : true;

      return {
        originalPrice: params.basePrice,
        studentPrice: Math.round(studentPrice * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        discountPercent: Math.round(discountPercent * 100) / 100,
        isEligible,
        reason: isEligible ? 'Eligible for student discount' : 'Not eligible at this campus'
      };
    } catch (error) {
      logger.error('Price calculation failed', { error, params });
      return {
        originalPrice: params.basePrice,
        studentPrice: params.basePrice,
        discount: 0,
        discountPercent: 0,
        isEligible: false,
        reason: 'Pricing service error'
      };
    }
  }

  async getProductsWithStudentPricing(params: {
    categoryId?: string;
    institutionId?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    try {
      const response = await axios.get(`${CATALOG_SERVICE_URL}/api/products`, {
        params: {
          for_student: true,
          category_id: params.categoryId,
          institution_id: params.institutionId,
          page: params.page || 1,
          limit: params.limit || 20
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch student products', { error });
      throw new Error('Failed to fetch products');
    }
  }

  async getProductPricingDetails(productId: string): Promise<any> {
    try {
      const response = await axios.get(`${CATALOG_SERVICE_URL}/api/products/${productId}/student-pricing`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch pricing details', { error });
      return null;
    }
  }

  async setProductStudentPricing(params: {
    merchantId: string;
    productId: string;
    config: StudentPricingConfig;
  }): Promise<void> {
    try {
      await axios.post(`${CATALOG_SERVICE_URL}/api/products/${params.productId}/student-pricing`, {
        merchantId: params.merchantId,
        ...params.config
      });

      logger.info('Student pricing set', {
        productId: params.productId,
        config: params.config
      });
    } catch (error) {
      logger.error('Failed to set student pricing', { error });
      throw new Error('Failed to set pricing');
    }
  }

  async bulkSetStudentPricing(params: {
    merchantId: string;
    productIds: string[];
    discountPercent: number;
    minPrice?: number;
    validUntil?: Date;
  }): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const productId of params.productIds) {
      try {
        await this.setProductStudentPricing({
          merchantId: params.merchantId,
          productId,
          config: {
            hasStudentDiscount: true,
            studentDiscountPercent: params.discountPercent,
            minStudentPrice: params.minPrice,
            validUntil: params.validUntil
          }
        });
        success++;
      } catch {
        failed++;
      }
    }

    logger.info('Bulk pricing set complete', { success, failed });
    return { success, failed };
  }

  async getStudentDealOfTheDay(institutionId: string): Promise<any> {
    try {
      const response = await axios.get(`${CATALOG_SERVICE_URL}/api/products/deal-of-day`, {
        params: { institution_id: institutionId }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch deal of day', { error });
      return null;
    }
  }

  async getAffordableOptions(params: {
    maxPrice: number;
    categoryId?: string;
    institutionId?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    try {
      const response = await axios.get(`${CATALOG_SERVICE_URL}/api/products/affordable`, {
        params: {
          max_price: params.maxPrice,
          category_id: params.categoryId,
          institution_id: params.institutionId,
          page: params.page || 1,
          limit: params.limit || 20
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch affordable options', { error });
      throw new Error('Failed to fetch products');
    }
  }

  async calculateCartDiscount(params: {
    userId: string;
    items: { productId: string; basePrice: number; quantity: number }[];
  }): Promise<{
    originalTotal: number;
    studentTotal: number;
    totalDiscount: number;
    savings: { productId: string; originalPrice: number; studentPrice: number; discount: number }[];
    overallDiscountPercent: number;
  }> {
    const savings: any[] = [];
    let originalTotal = 0;
    let studentTotal = 0;

    for (const item of params.items) {
      const priceCalc = await this.calculateStudentPrice({
        productId: item.productId,
        userId: params.userId,
        basePrice: item.basePrice,
        quantity: item.quantity
      });

      const itemOriginalTotal = item.basePrice * item.quantity;
      const itemStudentTotal = priceCalc.studentPrice * item.quantity;

      originalTotal += itemOriginalTotal;
      studentTotal += itemStudentTotal;

      if (priceCalc.discount > 0) {
        savings.push({
          productId: item.productId,
          originalPrice: item.basePrice,
          studentPrice: priceCalc.studentPrice,
          discount: priceCalc.discount * item.quantity
        });
      }
    }

    const totalDiscount = originalTotal - studentTotal;
    const overallDiscountPercent = originalTotal > 0
      ? (totalDiscount / originalTotal) * 100
      : 0;

    return {
      originalTotal: Math.round(originalTotal * 100) / 100,
      studentTotal: Math.round(studentTotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      savings,
      overallDiscountPercent: Math.round(overallDiscountPercent * 100) / 100
    };
  }

  private async checkStudentVerification(userId: string): Promise<{
    isVerified: boolean;
    institutionId?: string;
    tier?: string;
  }> {
    try {
      const response = await axios.get(`${process.env.REZ_STUDENT_SERVICE_URL || 'http://localhost:4025'}/api/student/verification-status`, {
        params: { userId }
      });

      return response.data;
    } catch {
      return { isVerified: false };
    }
  }

  private async getProductPricingConfig(productId: string): Promise<StudentPricingConfig | null> {
    try {
      const response = await axios.get(`${CATALOG_SERVICE_URL}/api/products/${productId}/student-pricing`);
      return response.data;
    } catch {
      return null;
    }
  }
}

export const studentPricingService = new StudentPricingService();
