import { StudentWallet, FundingRequest, StudentTransaction, StudentBudget } from '../models';
import { FundingRequestStatus } from '../types';
import { logger } from '../config/logger';
import axios from 'axios';

const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || 'http://localhost:4004';

export class StudentWalletService {
  async getOrCreateWallet(userId: string, institutionId: string, verificationId: string): Promise<any> {
    let wallet = await StudentWallet.findOne({ userId });

    if (!wallet) {
      wallet = new StudentWallet({
        userId,
        institutionId,
        verificationId
      });
      await wallet.save();
    }

    return wallet;
  }

  async getWallet(userId: string): Promise<any> {
    const wallet = await StudentWallet.findOne({ userId })
      .populate('parentConnections.parentId', 'name phone');

    if (!wallet) {
      throw new Error('Student wallet not found');
    }

    return this.formatWalletResponse(wallet);
  }

  async requestFunding(params: {
    studentId: string;
    parentId: string;
    amount: number;
    reason?: string;
  }): Promise<any> {
    // Verify parent connection exists
    const wallet = await StudentWallet.findOne({
      userId: params.studentId,
      'parentConnections.parentId': params.parentId,
      'parentConnections.status': 'active'
    });

    if (!wallet) {
      throw new Error('Parent not linked to student wallet');
    }

    // Check parent spending limit
    const parentConnection = wallet.parentConnections.find(
      p => p.parentId.toString() === params.parentId
    );

    if (parentConnection.monthlyLimit) {
      const monthlySpent = await this.getParentMonthlySpending(params.parentId, params.studentId);
      if (monthlySpent + params.amount > parentConnection.monthlyLimit) {
        throw new Error('Monthly spending limit exceeded');
      }
    }

    if (parentConnection.spendingLimitPerTransaction) {
      if (params.amount > parentConnection.spendingLimitPerTransaction) {
        throw new Error(`Transaction exceeds limit of ${parentConnection.spendingLimitPerTransaction}`);
      }
    }

    const request = new FundingRequest({
      studentId: params.studentId,
      parentId: params.parentId,
      amount: params.amount,
      reason: params.reason,
      status: FundingRequestStatus.PENDING
    });

    await request.save();

    // TODO: Send push notification to parent
    await this.notifyParent(params.parentId, {
      type: 'funding_request',
      studentId: params.studentId,
      requestId: request._id,
      amount: params.amount,
      reason: params.reason
    });

    logger.info(`Funding request created`, {
      requestId: request._id,
      studentId: params.studentId,
      parentId: params.parentId,
      amount: params.amount
    });

    return {
      requestId: request._id,
      status: request.status,
      amount: request.amount,
      message: 'Funding request sent to parent'
    };
  }

  async approveFunding(params: {
    requestId: string;
    parentId: string;
    note?: string;
  }): Promise<any> {
    const request = await FundingRequest.findById(params.requestId);

    if (!request) {
      throw new Error('Funding request not found');
    }

    if (request.status !== FundingRequestStatus.PENDING) {
      throw new Error('Request is not pending');
    }

    // Transfer funds from parent wallet to student wallet
    const transferResult = await this.transferFunds({
      fromUserId: params.parentId,
      toUserId: request.studentId.toString(),
      amount: request.amount,
      type: 'parent_funding',
      description: 'Wallet funding approved'
    });

    request.status = FundingRequestStatus.APPROVED;
    request.respondedAt = new Date();
    request.responseNote = params.note;
    request.transactionId = transferResult.transactionId;

    await request.save();

    // Update wallet balance
    await StudentWallet.updateOne(
      { userId: request.studentId },
      { $inc: { 'studentCash.balance': request.amount } }
    );

    // Create transaction record
    const transaction = new StudentTransaction({
      userId: request.studentId,
      institutionId: (await this.getStudentInstitution(request.studentId.toString())),
      type: 'funding',
      amount: request.amount,
      balance: await this.getStudentBalance(request.studentId.toString()),
      description: `Funds received from parent`,
      fundingRequestId: request._id
    });

    await transaction.save();

    // Notify student
    await this.notifyStudent(request.studentId.toString(), {
      type: 'funding_approved',
      amount: request.amount
    });

    logger.info(`Funding request approved`, {
      requestId: request._id,
      amount: request.amount
    });

    return {
      status: 'approved',
      amount: request.amount,
      transactionId: transferResult.transactionId
    };
  }

  async rejectFunding(params: {
    requestId: string;
    parentId: string;
    reason: string;
  }): Promise<void> {
    const request = await FundingRequest.findById(params.requestId);

    if (!request) {
      throw new Error('Funding request not found');
    }

    if (request.status !== FundingRequestStatus.PENDING) {
      throw new Error('Request is not pending');
    }

    request.status = FundingRequestStatus.REJECTED;
    request.respondedAt = new Date();
    request.responseNote = params.reason;

    await request.save();

    // Notify student
    await this.notifyStudent(request.studentId.toString(), {
      type: 'funding_rejected',
      amount: request.amount,
      reason: params.reason
    });

    logger.info(`Funding request rejected`, {
      requestId: request._id,
      reason: params.reason
    });
  }

  async linkParent(params: {
    studentId: string;
    parentId: string;
    relationship: 'mother' | 'father' | 'guardian' | 'other';
    monthlyLimit?: number;
    spendingLimitPerTransaction?: number;
  }): Promise<void> {
    const wallet = await StudentWallet.findOne({ userId: params.studentId });

    if (!wallet) {
      throw new Error('Student wallet not found');
    }

    // Check if already linked
    const existing = wallet.parentConnections.find(
      p => p.parentId.toString() === params.parentId
    );

    if (existing) {
      if (existing.status === 'active') {
        throw new Error('Parent already linked');
      }
      // Reactivate
      existing.status = 'active';
      existing.linkedAt = new Date();
      existing.monthlyLimit = params.monthlyLimit;
      existing.spendingLimitPerTransaction = params.spendingLimitPerTransaction;
    } else {
      wallet.parentConnections.push({
        parentId: params.parentId,
        relationship: params.relationship,
        linkedAt: new Date(),
        monthlyLimit: params.monthlyLimit,
        spendingLimitPerTransaction: params.spendingLimitPerTransaction,
        status: 'active'
      });
    }

    await wallet.save();

    logger.info(`Parent ${params.parentId} linked to student ${params.studentId}`);
  }

  async unlinkParent(params: {
    studentId: string;
    parentId: string;
  }): Promise<void> {
    const result = await StudentWallet.updateOne(
      { userId: params.studentId },
      {
        $set: {
          'parentConnections.$.status': 'removed'
        }
      }
    );

    if (result.modifiedCount === 0) {
      throw new Error('Parent connection not found');
    }

    logger.info(`Parent ${params.parentId} unlinked from student ${params.studentId}`);
  }

  async getFundingHistory(userId: string, params: {
    page: number;
    limit: number;
    type?: 'sent' | 'received';
  }): Promise<any> {
    let query: any = {};

    if (params.type === 'sent') {
      query.parentId = userId;
    } else if (params.type === 'received') {
      query.studentId = userId;
    } else {
      query = {
        $or: [
          { studentId: userId },
          { parentId: userId }
        ]
      };
    }

    const [requests, total] = await Promise.all([
      FundingRequest.find(query)
        .populate('studentId', 'name phone')
        .populate('parentId', 'name phone')
        .sort({ requestedAt: -1 })
        .skip((params.page - 1) * params.limit)
        .limit(params.limit),
      FundingRequest.countDocuments(query)
    ]);

    return {
      requests,
      total,
      page: params.page,
      totalPages: Math.ceil(total / params.limit)
    };
  }

  async recordTransaction(params: {
    userId: string;
    institutionId: string;
    type: 'order' | 'refund' | 'bonus' | 'redemption';
    amount: number;
    description: string;
    orderId?: string;
    merchantId?: string;
    category?: string;
    coinsEarned?: number;
    studentDiscount?: number;
  }): Promise<void> {
    const wallet = await StudentWallet.findOne({ userId: params.userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Update balance
    const balanceChange = params.type === 'order' ? -Math.abs(params.amount) : Math.abs(params.amount);
    wallet.studentCash.balance += balanceChange;

    // Update monthly spending for orders
    if (params.type === 'order') {
      wallet.studentCash.spentThisMonth += params.amount;
    }

    await wallet.save();

    // Create transaction record
    const transaction = new StudentTransaction({
      ...params,
      balance: wallet.studentCash.balance
    });

    await transaction.save();

    logger.info(`Transaction recorded`, {
      userId: params.userId,
      type: params.type,
      amount: params.amount
    });
  }

  async getBudgetSummary(userId: string): Promise<any> {
    const wallet = await StudentWallet.findOne({ userId });
    const budget = await StudentBudget.findOne({ userId });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const totalBudget = budget?.monthlyBudget || 0;
    const spent = wallet.studentCash.spentThisMonth;
    const balance = wallet.studentCash.balance;
    const remaining = totalBudget - spent;
    const percentUsed = totalBudget > 0 ? (spent / totalBudget) * 100 : 0;

    return {
      totalBudget,
      spent,
      remaining: Math.max(0, remaining),
      balance,
      percentUsed: Math.min(100, percentUsed),
      alerts: wallet.studentCash.budgetAlertAt,
      isOverBudget: spent > totalBudget,
      categoryBreakdown: budget?.categories || []
    };
  }

  async setBudget(userId: string, institutionId: string, params: {
    monthlyBudget: number;
    categories?: { name: string; limit: number }[];
    alertThreshold?: number;
  }): Promise<void> {
    const budget = await StudentBudget.findOneAndUpdate(
      { userId },
      {
        $set: {
          institutionId,
          monthlyBudget: params.monthlyBudget,
          categories: params.categories || [],
          'alerts.0.threshold': params.alertThreshold || 80
        }
      },
      { upsert: true, new: true }
    );

    // Update wallet alert threshold
    await StudentWallet.updateOne(
      { userId },
      { $set: { 'studentCash.budgetAlertAt': params.alertThreshold || 80 } }
    );

    logger.info(`Budget set for user ${userId}`, { monthlyBudget: params.monthlyBudget });
  }

  async resetMonthlySpending(): Promise<void> {
    // Run daily to reset spending for new month
    const lastReset = new Date();
    lastReset.setDate(1);
    lastReset.setHours(0, 0, 0, 0);

    await StudentWallet.updateMany(
      { 'studentCash.lastResetAt': { $lt: lastReset } },
      {
        $set: {
          'studentCash.spentThisMonth': 0,
          'studentCash.lastResetAt': new Date()
        }
      }
    );

    logger.info('Monthly spending reset completed');
  }

  private async transferFunds(params: {
    fromUserId: string;
    toUserId: string;
    amount: number;
    type: string;
    description: string;
  }): Promise<{ transactionId: string }> {
    try {
      // Call wallet service to perform transfer
      const response = await axios.post(`${WALLET_SERVICE_URL}/internal/transfer`, {
        fromUserId: params.fromUserId,
        toUserId: params.toUserId,
        amount: params.amount,
        type: params.type,
        description: params.description
      });

      return { transactionId: response.data.transactionId };
    } catch (error) {
      logger.error('Fund transfer failed', { error, params });
      throw new Error('Failed to transfer funds');
    }
  }

  private async getParentMonthlySpending(parentId: string, studentId: string): Promise<number> {
    const result = await FundingRequest.aggregate([
      {
        $match: {
          parentId: parentId,
          studentId: studentId,
          status: FundingRequestStatus.APPROVED,
          respondedAt: {
            $gte: new Date(new Date().setDate(1))
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    return result[0]?.total || 0;
  }

  private async getStudentBalance(userId: string): Promise<number> {
    const wallet = await StudentWallet.findOne({ userId });
    return wallet?.studentCash.balance || 0;
  }

  private async getStudentInstitution(userId: string): Promise<string> {
    const wallet = await StudentWallet.findOne({ userId });
    return wallet?.institutionId?.toString() || '';
  }

  private async notifyParent(parentId: string, data: any): Promise<void> {
    try {
      await axios.post(`${process.env.NOTIFICATION_SERVICE_URL}/send`, {
        userId: parentId,
        type: 'push',
        title: 'New Funding Request',
        body: `${data.amount} funding request from student`,
        data
      });
    } catch (error) {
      logger.error('Failed to notify parent', { error });
    }
  }

  private async notifyStudent(studentId: string, data: any): Promise<void> {
    try {
      await axios.post(`${process.env.NOTIFICATION_SERVICE_URL}/send`, {
        userId: studentId,
        type: 'push',
        title: data.type === 'funding_approved' ? 'Funds Received!' : 'Funding Update',
        body: data.type === 'funding_approved'
          ? `${data.amount} added to your wallet`
          : 'Your funding request was updated',
        data
      });
    } catch (error) {
      logger.error('Failed to notify student', { error });
    }
  }

  private formatWalletResponse(wallet: any): any {
    return {
      id: wallet._id,
      balance: wallet.studentCash.balance,
      monthlyAllowance: wallet.studentCash.monthlyAllowance,
      spentThisMonth: wallet.studentCash.spentThisMonth,
      budgetAlertAt: wallet.studentCash.budgetAlertAt,
      parents: wallet.parentConnections
        .filter(p => p.status === 'active')
        .map(p => ({
          id: p.parentId._id,
          name: p.parentId.name,
          phone: p.parentId.phone,
          relationship: p.relationship,
          monthlyLimit: p.monthlyLimit,
          spendingLimitPerTransaction: p.spendingLimitPerTransaction
        })),
      status: wallet.status,
      createdAt: wallet.createdAt
    };
  }
}

export const studentWalletService = new StudentWalletService();
