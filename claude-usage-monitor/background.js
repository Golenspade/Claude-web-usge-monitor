// Claude Usage Monitor Background Script (Manifest V2)
class BackgroundManager {
  constructor() {
    this.init();
  }
  
  init() {
    this.setupMessageListeners();
    this.setupTabListeners();
    this.setupAlarms();
    
    console.log('Claude Usage Monitor: Background script initialized');
  }
  
  setupMessageListeners() {
    // 监听来自内容脚本和弹窗的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'getUsageData':
          this.handleGetUsageData(sendResponse);
          return true; // 保持消息通道开放
          
        case 'updateUsageData':
          this.handleUpdateUsageData(request.data, sendResponse);
          return true;
          
        case 'resetUsageData':
          this.handleResetUsageData(sendResponse);
          return true;
          
        default:
          console.log('Unknown message action:', request.action);
      }
    });
  }
  
  setupTabListeners() {
    // 监听标签页变化
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.checkClaudeTab(activeInfo.tabId);
    });
    
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('claude.ai')) {
        // Manifest V2 中内容脚本会自动注入，无需手动注入
        console.log('Claude tab detected:', tab.url);
      }
    });
  }
  
  setupAlarms() {
    // 设置定期检查用量的闹钟
    chrome.alarms.create('checkUsage', { periodInMinutes: 5 });
    chrome.alarms.create('dailyReset', { when: this.getNextMidnight() });
    
    chrome.alarms.onAlarm.addListener((alarm) => {
      switch (alarm.name) {
        case 'checkUsage':
          this.checkUsageLimits();
          break;
        case 'dailyReset':
          this.performDailyReset();
          break;
      }
    });
  }
  
  async checkClaudeTab(tabId) {
    try {
      const tab = await new Promise((resolve) => {
        chrome.tabs.get(tabId, resolve);
      });
      
      if (tab.url && tab.url.includes('claude.ai')) {
        console.log('Claude tab activated:', tab.url);
      }
    } catch (error) {
      console.error('Error checking tab:', error);
    }
  }
  
  async handleGetUsageData(sendResponse) {
    try {
      const result = await chrome.storage.local.get(['claudeUsageData']);
      sendResponse({ 
        success: true, 
        usageData: result.claudeUsageData || this.getDefaultUsageData() 
      });
    } catch (error) {
      console.error('Failed to get usage data:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  async handleUpdateUsageData(data, sendResponse) {
    try {
      const existing = await chrome.storage.local.get(['claudeUsageData']);
      const updated = { ...existing.claudeUsageData, ...data };
      
      await chrome.storage.local.set({ claudeUsageData: updated });
      
      // 检查是否达到警告阈值
      this.checkUsageWarnings(updated);
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to update usage data:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  async handleResetUsageData(sendResponse) {
    try {
      const defaultData = this.getDefaultUsageData();
      await chrome.storage.local.set({ claudeUsageData: defaultData });
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to reset usage data:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  getDefaultUsageData() {
    return {
      messagesCount: 0,
      tokensUsed: 0,
      lastResetTime: new Date().toDateString(),
      planType: 'unknown',
      dailyLimit: null,
      currentUsagePercent: 0
    };
  }
  
  async checkUsageWarnings(usageData) {
    // 80% 警告
    if (usageData.currentUsagePercent >= 80 && usageData.currentUsagePercent < 90) {
      this.showNotification('usage-warning-80', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Claude Usage Warning',
        message: `You've used ${usageData.currentUsagePercent}% of your daily limit`
      });
    }
    
    // 95% 严重警告
    if (usageData.currentUsagePercent >= 95) {
      this.showNotification('usage-warning-95', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Claude Usage Critical',
        message: `You've used ${usageData.currentUsagePercent}% of your daily limit. Consider upgrading your plan.`
      });
    }
  }
  
  showNotification(id, options) {
    chrome.notifications.create(id, options);
    
    // 自动清除通知
    setTimeout(() => {
      chrome.notifications.clear(id);
    }, 10000);
  }
  
  async checkUsageLimits() {
    try {
      const result = await chrome.storage.local.get(['claudeUsageData']);
      const usageData = result.claudeUsageData;
      
      if (!usageData) return;
      
      // 检查是否需要每日重置
      const today = new Date().toDateString();
      if (usageData.lastResetTime !== today) {
        await this.performDailyReset();
      }
      
    } catch (error) {
      console.error('Error checking usage limits:', error);
    }
  }
  
  async performDailyReset() {
    try {
      const result = await chrome.storage.local.get(['claudeUsageData']);
      const currentData = result.claudeUsageData || this.getDefaultUsageData();
      
      const resetData = {
        ...currentData,
        messagesCount: 0,
        currentUsagePercent: 0,
        lastResetTime: new Date().toDateString()
      };
      
      await chrome.storage.local.set({ claudeUsageData: resetData });
      
      // 设置下一次重置时间
      chrome.alarms.create('dailyReset', { when: this.getNextMidnight() });
      
      console.log('Claude Usage Monitor: Daily reset performed');
    } catch (error) {
      console.error('Failed to perform daily reset:', error);
    }
  }
  
  getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // 明天午夜
    return midnight.getTime();
  }
}

// 初始化后台管理器
new BackgroundManager();