// Claude Usage Monitor Popup Script
class PopupManager {
  constructor() {
    this.usageData = null;
    this.init();
  }
  
  async init() {
    await this.loadUsageData();
    this.setupEventListeners();
    this.setupStorageListener();
    this.updateDisplay();
    
    // 启动定期刷新
    this.startAutoRefresh();
  }
  
  async loadUsageData() {
    try {
      const result = await chrome.storage.local.get(['claudeUsageData']);
      this.usageData = result.claudeUsageData || {
        messagesCount: 0,
        tokensUsed: 0,
        lastResetTime: null,
        planType: 'unknown',
        dailyLimit: null,
        currentUsagePercent: 0,
        limitActive: false,
        limitHitTime: null,
        limitResetTime: null,
        modelDisplay: 'Unknown Model'
      };
      
      // 检查是否需要重置每日数据
      this.checkDailyReset();
      
    } catch (error) {
      console.error('Failed to load usage data:', error);
      this.showError('Failed to load usage data');
    }
  }
  
  checkDailyReset() {
    const now = new Date();
    const today = now.toDateString();
    
    if (this.usageData.lastResetTime !== today) {
      // 新的一天，重置计数
      this.usageData.messagesCount = 0;
      this.usageData.currentUsagePercent = 0;
      this.usageData.lastResetTime = today;
      this.saveUsageData();
    }
  }
  
  setupEventListeners() {
    // 刷新按钮
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.refreshData();
    });
    
    // 重置按钮
    document.getElementById('reset-btn').addEventListener('click', () => {
      this.resetData();
    });
    
    // 测试按钮
    document.getElementById('test-btn').addEventListener('click', () => {
      this.testMessage();
    });
  }
  
  setupStorageListener() {
    // 监听storage变化以实时更新
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.claudeUsageData) {
        console.log('Storage changed, updating display');
        this.usageData = changes.claudeUsageData.newValue;
        this.updateDisplay();
      }
    });
  }
  
  startAutoRefresh() {
    // 每3秒自动刷新一次
    setInterval(() => {
      this.loadUsageData().then(() => {
        this.updateDisplay();
      });
    }, 3000);
  }
  
  async refreshData() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    
    try {
      // 尝试从当前活动标签页获取最新数据
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        
        if (tab.url && tab.url.includes('claude.ai')) {
          // 向内容脚本发送消息获取最新数据
          chrome.tabs.sendMessage(tab.id, { action: 'getUsageData' }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Content script not available, using stored data');
            } else if (response && response.usageData) {
              this.usageData = response.usageData;
              this.saveUsageData();
            }
            
            this.loadUsageData().then(() => {
              this.updateDisplay();
              document.getElementById('loading').style.display = 'none';
              document.getElementById('main-content').style.display = 'block';
            });
          });
        } else {
          this.loadUsageData().then(() => {
            this.updateDisplay();
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
          });
        }
      });
      
    } catch (error) {
      console.error('Failed to refresh data:', error);
      this.showError('Failed to refresh data');
      
      document.getElementById('loading').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
    }
  }
  
  async resetData() {
    if (confirm('Are you sure you want to reset usage data?')) {
      this.usageData = {
        messagesCount: 0,
        tokensUsed: 0,
        lastResetTime: new Date().toDateString(),
        planType: this.usageData.planType || 'unknown',
        dailyLimit: this.usageData.dailyLimit,
        currentUsagePercent: 0,
        limitActive: false,
        limitHitTime: null,
        limitResetTime: null,
        modelDisplay: this.usageData.modelDisplay || 'Unknown Model'
      };
      
      await this.saveUsageData();
      this.updateDisplay();
    }
  }
  
  async testMessage() {
    try {
      // 直接更新本地数据
      this.usageData.messagesCount++;
      this.updateUsagePercent();
      await this.saveUsageData();
      this.updateDisplay();
      
      // 同时尝试发送消息给content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab.url && tab.url.includes('claude.ai')) {
          chrome.tabs.sendMessage(tab.id, { action: 'testMessage' }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Content script not available');
            } else {
              console.log('Test message sent to content script');
            }
          });
        }
      });
    } catch (error) {
      console.error('Failed to test message:', error);
    }
  }
  
  updateUsagePercent() {
    if (this.usageData.dailyLimit && this.usageData.dailyLimit > 0) {
      this.usageData.currentUsagePercent = Math.round(
        (this.usageData.messagesCount / this.usageData.dailyLimit) * 100
      );
    } else {
      // 使用默认估算
      const estimatedLimit = this.usageData.planType === 'pro' ? 45 : 
                           this.usageData.planType === 'max' ? 200 : 20;
      this.usageData.currentUsagePercent = Math.round(
        (this.usageData.messagesCount / estimatedLimit) * 100
      );
    }
  }
  
  updateDisplay() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';

    // 顶部统计：模型
    const modelEl = document.getElementById('model-display');
    if (modelEl) modelEl.textContent = this.usageData.modelDisplay || 'Unknown Model';

    const usagePercentEl = document.getElementById('usage-percent');
    const progressBar = document.getElementById('usage-progress-bar');
    const limitTimerEl = document.getElementById('limit-timer');

    const now = Date.now();
    const limitActive = !!this.usageData.limitActive;
    const resetMs = this.usageData.limitResetTime ? new Date(this.usageData.limitResetTime).getTime() : 0;
    const hasOfficialReset = resetMs && now < resetMs;

    if (limitActive) {
      if (usagePercentEl) usagePercentEl.textContent = 'Limit Reached';
      progressBar.style.width = '100%';
      progressBar.className = 'usage-bar';
      if (limitTimerEl) {
        if (hasOfficialReset) {
          const remaining = resetMs - now;
          limitTimerEl.style.display = 'block';
          limitTimerEl.textContent = `Resets in: ${this.formatRemainingTime(remaining)}`;
        } else {
          limitTimerEl.style.display = 'none';
        }
      }
    } else {
      if (usagePercentEl) usagePercentEl.textContent = `${this.usageData.currentUsagePercent}%`;
      progressBar.style.width = `${this.usageData.currentUsagePercent}%`;
      progressBar.className = 'usage-bar';
      if (limitTimerEl) limitTimerEl.style.display = 'none';
    }

    // 使用情况文本
    document.getElementById('usage-current').textContent = `${this.usageData.messagesCount} messages`;
    document.getElementById('usage-limit').textContent = this.usageData.dailyLimit ? `${this.usageData.dailyLimit} limit` : 'Unknown limit';

    // 计划信息
    document.getElementById('plan-type').textContent = this.getPlanDisplayName();
    document.getElementById('plan-details').textContent = this.getPlanDetails();
  }
  
  getPlanDisplayName() {
    switch (this.usageData.planType) {
      case 'pro':
        return 'Claude Pro';
      case 'max':
        return 'Claude Max';
      case 'free':
        return 'Claude Free';
      default:
        return 'Unknown Plan';
    }
  }
  
  getPlanDetails() {
    switch (this.usageData.planType) {
      case 'pro':
        return 'Pro plan: ~45 messages per 5 hours, priority access, early features';
      case 'max':
        return 'Max plan: ~200+ messages per 5 hours, Claude Code access, highest limits';
      case 'free':
        return 'Free plan: Limited messages per day, basic access';
      default:
        return 'Visit claude.ai to detect your plan automatically';
    }
  }
  
  showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';

    // 自动隐藏错误消息
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }

  formatRemainingTime(ms) {
    if (!ms || ms < 0) return '0h 0m';
    const totalMinutes = Math.ceil(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  }
  
  async saveUsageData() {
    try {
      await chrome.storage.local.set({ claudeUsageData: this.usageData });
    } catch (error) {
      console.error('Failed to save usage data:', error);
    }
  }
}

// 初始化弹窗管理器
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});