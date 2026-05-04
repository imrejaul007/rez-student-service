import { StudentProfile, StudentMission, StudentLeaderboard, StudentTransaction } from '../models';
import {
  StudentTier,
  MissionStatus,
  STUDENT_TIER_CONFIG,
  STUDENT_MISSIONS
} from '../types';
import { logger } from '../config/logger';
import axios from 'axios';

const GAMIFICATION_SERVICE_URL = process.env.GAMIFICATION_SERVICE_URL || 'http://localhost:4005';

export class StudentGamificationService {
  async getStudentProfile(userId: string): Promise<any> {
    const profile = await StudentProfile.findOne({ userId })
      .populate('institutionId', 'name shortName');

    if (!profile) {
      throw new Error('Student profile not found');
    }

    const tierConfig = STUDENT_TIER_CONFIG[profile.tier as StudentTier];
    const nextTier = this.getNextTier(profile.tier as StudentTier);

    return {
      id: profile._id,
      userId: profile.userId,
      institution: profile.institutionId,
      tier: profile.tier,
      tierConfig,
      lifetimeCoins: profile.lifetimeCoins,
      currentCoins: profile.currentCoins,
      totalOrders: profile.totalOrders,
      totalSavings: profile.totalSavings,
      achievements: profile.achievements,
      referralCode: profile.referralCode,
      referralsCount: profile.referralsCount,
      campusRank: profile.campusRank,
      institutionRank: profile.institutionRank,
      nextTier: nextTier ? {
        tier: nextTier,
        config: STUDENT_TIER_CONFIG[nextTier],
        coinsNeeded: STUDENT_TIER_CONFIG[nextTier].minCoins - profile.lifetimeCoins
      } : null,
      progress: this.calculateTierProgress(profile.lifetimeCoins, profile.tier as StudentTier)
    };
  }

  async updateStudentStats(userId: string, params: {
    orderId?: string;
    merchantId?: string;
    orderAmount?: number;
    studentDiscount?: number;
    coinsEarned?: number;
  }): Promise<void> {
    const profile = await StudentProfile.findOne({ userId });
    if (!profile) return;

    // Update order count and savings
    if (params.orderId) {
      profile.totalOrders += 1;
    }
    if (params.studentDiscount) {
      profile.totalSavings += params.studentDiscount;
    }

    // Update coins
    if (params.coinsEarned) {
      const tierMultiplier = STUDENT_TIER_CONFIG[profile.tier as StudentTier].multiplier;
      const actualCoins = Math.floor(params.coinsEarned * tierMultiplier);

      profile.lifetimeCoins += actualCoins;
      profile.currentCoins += actualCoins;

      // Check for tier upgrade
      await this.checkTierUpgrade(profile);
    }

    profile.lastActiveAt = new Date();
    await profile.save();

    // Update missions
    if (params.orderId) {
      await this.updateMissionProgress(userId, 'order_count');
      await this.updateMissionProgress(userId, 'unique_merchant_count', params.merchantId);
    }

    // Update leaderboard
    await this.updateLeaderboard(profile.institutionId.toString(), userId, profile.currentCoins);

    // Sync with main gamification service
    await this.syncWithGamificationService(userId, profile);

    logger.info('Student stats updated', { userId, params });
  }

  private async checkTierUpgrade(profile: any): Promise<void> {
    const currentTier = profile.tier as StudentTier;
    const nextTier = this.getNextTier(currentTier);

    if (nextTier && profile.lifetimeCoins >= STUDENT_TIER_CONFIG[nextTier].minCoins) {
      const oldTier = currentTier;
      profile.tier = nextTier;

      // Notify about tier upgrade
      await this.notifyTierUpgrade(profile.userId, oldTier, nextTier);

      logger.info(`Student ${profile.userId} upgraded from ${oldTier} to ${nextTier}`);
    }
  }

  private getNextTier(current: StudentTier): StudentTier | null {
    const tiers = Object.values(StudentTier);
    const currentIndex = tiers.indexOf(current);

    if (currentIndex < tiers.length - 1) {
      return tiers[currentIndex + 1];
    }
    return null;
  }

  private calculateTierProgress(coins: number, tier: StudentTier): number {
    const tierConfig = STUDENT_TIER_CONFIG[tier];
    const nextTier = this.getNextTier(tier);

    if (!nextTier) {
      // Already at max tier
      return 100;
    }

    const nextMinCoins = STUDENT_TIER_CONFIG[nextTier].minCoins;
    const prevMinCoins = tierConfig.minCoins;
    const range = nextMinCoins - prevMinCoins;
    const progress = coins - prevMinCoins;

    return Math.min(100, Math.floor((progress / range) * 100));
  }

  async getAvailableMissions(userId: string): Promise<any[]> {
    const missions = await StudentMission.find({ userId })
      .populate('userId', 'name');

    return missions.map(mission => {
      const missionConfig = STUDENT_MISSIONS.find(m => m.id === mission.missionId);
      if (!missionConfig) return null;

      return {
        id: mission._id,
        missionId: mission.missionId,
        title: missionConfig.title,
        description: missionConfig.description,
        coins: missionConfig.coins,
        target: mission.target,
        progress: mission.progress,
        status: mission.status,
        percentComplete: Math.floor((mission.progress / mission.target) * 100),
        expiresAt: mission.expiresAt,
        rewardClaimed: mission.rewardClaimed
      };
    }).filter(Boolean);
  }

  async updateMissionProgress(userId: string, type: string, merchantId?: string): Promise<void> {
    const activeMissions = await StudentMission.find({
      userId,
      status: { $in: [MissionStatus.AVAILABLE, MissionStatus.IN_PROGRESS] },
      expiresAt: { $gt: new Date() }
    });

    for (const mission of activeMissions) {
      const missionConfig = STUDENT_MISSIONS.find(m => m.id === mission.missionId);
      if (!missionConfig || missionConfig.type !== type) continue;

      // Update progress
      mission.progress += 1;

      if (mission.status === MissionStatus.AVAILABLE) {
        mission.status = MissionStatus.IN_PROGRESS;
        mission.startedAt = new Date();
      }

      // Check completion
      if (mission.progress >= mission.target) {
        mission.status = MissionStatus.COMPLETED;
        mission.completedAt = new Date();
      }

      await mission.save();
    }
  }

  async claimMissionReward(params: {
    userId: string;
    missionId: string;
  }): Promise<{ coins: number; achievement?: any }> {
    const mission = await StudentMission.findOne({
      _id: params.missionId,
      userId: params.userId,
      status: MissionStatus.COMPLETED,
      rewardClaimed: false
    });

    if (!mission) {
      throw new Error('Mission not found or already claimed');
    }

    const missionConfig = STUDENT_MISSIONS.find(m => m.id === mission.missionId);
    if (!missionConfig) {
      throw new Error('Mission config not found');
    }

    // Award coins
    const profile = await StudentProfile.findOne({ userId: params.userId });
    if (!profile) {
      throw new Error('Student profile not found');
    }

    profile.currentCoins += missionConfig.coins;
    profile.lifetimeCoins += missionConfig.coins;
    profile.missionsCompleted.push(mission.missionId);
    await profile.save();

    // Mark reward as claimed
    mission.rewardClaimed = true;
    await mission.save();

    // Check for achievement
    const achievement = await this.checkAchievement(params.userId, mission.missionId);

    // Update leaderboard
    await this.updateLeaderboard(profile.institutionId.toString(), params.userId, profile.currentCoins);

    logger.info(`Mission reward claimed`, {
      userId: params.userId,
      missionId: mission.missionId,
      coins: missionConfig.coins
    });

    return {
      coins: missionConfig.coins,
      achievement
    };
  }

  private async checkAchievement(userId: string, missionId: string): Promise<any | null> {
    const profile = await StudentProfile.findOne({ userId });
    if (!profile) return null;

    // Define achievements based on mission completion
    const achievementMap: Record<string, { id: string; title: string }> = {
      'first_student_order': { id: 'first_order', title: 'First Bite' },
      'refer_5_classmates': { id: 'social_butterfly', title: 'Social Butterfly' },
      'campus_explorer': { id: 'explorer', title: 'Campus Explorer' },
      'graduation_gold': { id: 'scholar_grad', title: 'Scholar Graduate' }
    };

    const achievementInfo = achievementMap[missionId];
    if (!achievementInfo) return null;

    // Check if already has achievement
    if (profile.achievements.some(a => a.id === achievementInfo.id)) {
      return null;
    }

    // Add achievement
    profile.achievements.push({
      id: achievementInfo.id,
      earnedAt: new Date()
    });
    await profile.save();

    return achievementInfo;
  }

  async getCampusLeaderboard(institutionId: string, params: {
    period: 'weekly' | 'monthly' | 'all_time';
    page?: number;
    limit?: number;
    userId?: string;
  }): Promise<any> {
    const page = params.page || 1;
    const limit = params.limit || 10;

    // Try to get cached leaderboard first
    let leaderboard = await StudentLeaderboard.findOne({
      institutionId,
      period: params.period
    });

    // Recalculate if stale (>1 hour for weekly, >1 day for others)
    const staleThreshold = params.period === 'weekly' ? 3600000 : 86400000;
    const isStale = !leaderboard ||
      (new Date().getTime() - leaderboard.lastCalculatedAt.getTime()) > staleThreshold;

    if (isStale) {
      await this.calculateLeaderboard(institutionId, params.period);
      leaderboard = await StudentLeaderboard.findOne({ institutionId, period: params.period });
    }

    if (!leaderboard) {
      return { rankings: [], userRank: null, total: 0 };
    }

    // Get user's rank
    const userRank = leaderboard.rankings.findIndex(r =>
      r.userId.toString() === params.userId
    ) + 1;

    return {
      rankings: leaderboard.rankings.slice((page - 1) * limit, page * limit),
      userRank: userRank > 0 ? userRank : null,
      total: leaderboard.rankings.length,
      period: params.period,
      lastUpdated: leaderboard.lastCalculatedAt
    };
  }

  async getUserRank(userId: string, institutionId: string): Promise<any> {
    const profiles = await StudentProfile.find({ institutionId })
      .sort({ currentCoins: -1 });

    const rank = profiles.findIndex(p => p.userId.toString() === userId) + 1;
    const profile = profiles.find(p => p.userId.toString() === userId);

    if (!profile) {
      throw new Error('Student not found');
    }

    const tiersAbove = profiles.filter(p =>
      STUDENT_TIER_CONFIG[p.tier as StudentTier].multiplier >
      STUDENT_TIER_CONFIG[profile.tier as StudentTier].multiplier
    ).length;

    return {
      rank,
      total: profiles.length,
      percentile: Math.floor(((profiles.length - rank) / profiles.length) * 100),
      tier: profile.tier,
      coins: profile.currentCoins,
      tiersAbove
    };
  }

  private async calculateLeaderboard(institutionId: string, period: 'weekly' | 'monthly' | 'all_time'): Promise<void> {
    let dateFilter: Date;

    if (period === 'weekly') {
      dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - 7);
    } else if (period === 'monthly') {
      dateFilter = new Date();
      dateFilter.setMonth(dateFilter.getMonth() - 1);
    } else {
      dateFilter = new Date(0); // All time
    }

    // Get all students from institution
    const profiles = await StudentProfile.find({ institutionId });

    // Calculate coins earned in period
    const coinsInPeriod = await StudentTransaction.aggregate([
      {
        $match: {
          institutionId,
          createdAt: { $gte: dateFilter },
          type: { $in: ['order', 'bonus'] }
        }
      },
      {
        $group: {
          _id: '$userId',
          coins: { $sum: '$coinsEarned' }
        }
      }
    ]);

    const coinMap = new Map(coinsInPeriod.map(c => [c._id.toString(), c.coins]));

    const rankings = profiles.map(profile => ({
      userId: profile.userId,
      coins: coinMap.get(profile.userId.toString()) || 0,
      tier: profile.tier,
      lastUpdated: new Date()
    }));

    // Sort by coins
    rankings.sort((a, b) => b.coins - a.coins);

    // Update or create leaderboard
    await StudentLeaderboard.findOneAndUpdate(
      { institutionId, period },
      {
        rankings,
        lastCalculatedAt: new Date()
      },
      { upsert: true }
    );

    // Update rank on profiles
    for (let i = 0; i < rankings.length; i++) {
      await StudentProfile.updateOne(
        { userId: rankings[i].userId },
        { $set: { institutionRank: i + 1 } }
      );
    }

    logger.info(`Leaderboard calculated for institution ${institutionId}`, {
      period,
      participants: rankings.length
    });
  }

  private async updateLeaderboard(institutionId: string, userId: string, coins: number): Promise<void> {
    // Update weekly leaderboard
    await StudentLeaderboard.updateOne(
      { institutionId, period: 'weekly' },
      {
        $set: {
          'rankings.$[elem].coins': coins,
          'rankings.$[elem].lastUpdated': new Date()
        },
        $setOnInsert: {
          institutionId,
          period: 'weekly'
        }
      },
      { arrayFilters: [{ 'elem.userId': userId }], upsert: true }
    );
  }

  private async notifyTierUpgrade(userId: string, oldTier: StudentTier, newTier: StudentTier): Promise<void> {
    try {
      await axios.post(`${process.env.NOTIFICATION_SERVICE_URL}/send`, {
        userId,
        type: 'push',
        title: 'Tier Upgraded!',
        body: `Congratulations! You've been promoted to ${STUDENT_TIER_CONFIG[newTier].badge}`,
        data: {
          type: 'tier_upgrade',
          oldTier,
          newTier,
          perks: STUDENT_TIER_CONFIG[newTier].perks
        }
      });
    } catch (error) {
      logger.error('Failed to notify tier upgrade', { error });
    }
  }

  private async syncWithGamificationService(userId: string, profile: any): Promise<void> {
    try {
      await axios.post(`${GAMIFICATION_SERVICE_URL}/internal/student-sync`, {
        userId,
        coins: profile.currentCoins,
        tier: profile.tier,
        institutionId: profile.institutionId
      });
    } catch (error) {
      logger.error('Failed to sync with gamification service', { error });
    }
  }
}

export const studentGamificationService = new StudentGamificationService();
