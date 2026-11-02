/**
 * TaskWeaver 全局常量配置
 * 集中管理所有魔法数字和配置阈值
 */

// ==================== DAG 编排配置 ====================
export const DAG_CONFIG = {
  // 节点数量限制
  NODE_LIMIT_DEFAULT: 6,
  NODE_LIMIT_MAX: 12,
  NODE_LIMIT_MIN: 1,

  // 并发控制
  MAX_CONCURRENCY: 10,

  // Planner 索引深度
  PLANNER_INDEX_MAX_DEPTH: 6,
  PLANNER_PATH_HINT_LIMIT_DEFAULT: 90,

  // 依赖环检测
  MAX_CYCLE_DETECTION_DEPTH: 1000,
}

// ==================== 队列与存储配置 ====================
export const QUEUE_CONFIG = {
  // 最近条目缓存大小
  MAX_RECENT_ENTRY_IDS: 4096,

  // 清理阈值
  CLEANUP_THRESHOLD: 1000,

  // 批量写入延迟 (ms)
  BATCH_WRITE_DELAY: 200,

  // 队列刷新间隔 (ms)
  FLUSH_INTERVAL: 5000,
}

// ==================== 路由策略配置 ====================
export const ROUTING_CONFIG = {
  // 任务类型档位顺序
  TASK_TIER_ORDER: {
    research: ['cheap', 'balanced', 'strong'],
    test: ['cheap', 'balanced', 'strong'],
    implementation: ['balanced', 'strong', 'cheap'],
    review: ['strong', 'balanced', 'cheap'],
    hard_debug: ['strong', 'balanced', 'cheap'],
  },

  // 档位排名
  TIER_RANK: Object.freeze({ cheap: 0, balanced: 1, strong: 2 }),

  // 打分权重
  SCORE_WEIGHTS: {
    TASK_AFFINITY_MAX: 35,
    SUBSCRIPTION_BONUS: 10,
    FREE_MODEL_BONUS: 5,
    QUOTA_SUFFICIENT_BONUS: 8,
    ALLOCATION_REUSE_PENALTY: -5,
    METERED_SURGE_PENALTY: -10,
    METERED_COST_MAX_PENALTY: 30,
  },

  // 配额阈值
  QUOTA_THRESHOLDS: {
    SUFFICIENT_REMAINING_RATIO: 0.3, // 30% 以上认为充足
    LOW_REMAINING_RATIO: 0.1,        // 10% 以下认为不足
  },
}
