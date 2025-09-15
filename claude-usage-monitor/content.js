// Claude Usage Monitor Content Script - 修复版 V2
(function() {
  'use strict';

  // 防止重复注入
  if (window.claudeUsageMonitorInjected) {
    return;
  }
  window.claudeUsageMonitorInjected = true;

  console.log('Claude Usage Monitor: Starting...');

  class ClaudeUsageMonitor {
    constructor() {
      this.usageData = {
        messagesCount: 0,
        tokensUsed: 0,
        lastResetTime: null,
        planType: 'unknown',
        dailyLimit: null,
        currentUsagePercent: 0,
        // New fields for 5-hour limit and model detection
        limitActive: false,
        limitHitTime: null,
        limitResetTime: null,
        modelDisplay: 'Unknown Model'
      };

      this.observers = [];
      this.messagesSent = 0;
      this.displayCollapsed = false;
      this.init();
    }

    async init() {
      console.log('Claude Usage Monitor: Initializing...');

      // 加载已保存的数据
      await this.loadUsageData();

      // 等待页面完全加载
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.startMonitoring());
      } else {
        this.startMonitoring();
      }
    }

    async startMonitoring() {
      console.log('Claude Usage Monitor: Starting monitoring...');

      // 延迟启动，等待Claude界面完全加载
      setTimeout(async () => {
        await this.detectPlanType();
        this.observeMessageSending();
        this.observeUsageLimits();
        this.createUsageDisplay();
        this.updateDisplay();

        // 定期更新
        setInterval(() => this.updateUsageData(), 5000);

        console.log('Claude Usage Monitor: Monitoring started');
      }, 3000);
    }

    async detectPlanType() {
      console.log('Claude Usage Monitor: Detecting plan type...');

      // 多种方式检测计划类型
      const detectionMethods = [
        () => this.detectFromURL(),
        () => this.detectFromPageText(),
        () => this.detectFromElements(),
        () => this.detectFromLocalStorage()
      ];

      for (const method of detectionMethods) {
        try {
          const result = method();
          if (result && result !== 'unknown') {
            this.usageData.planType = result;
            this.setPlanLimits(result);
            console.log('Plan detected:', result);
            break;
          }
        } catch (error) {
          console.log('Detection method failed:', error);
        }
      }

      await this.saveUsageData();
    }

    detectFromURL() {
      const url = window.location.href;
      if (url.includes('/pro') || url.includes('plan=pro')) {
        return 'pro';
      }
      if (url.includes('/max') || url.includes('plan=max')) {
        return 'max';
      }
      return null;
    }

    detectFromPageText() {
      const bodyText = document.body.textContent.toLowerCase();

      if (bodyText.includes('claude pro') || bodyText.includes('pro plan')) {
        return 'pro';
      }
      if (bodyText.includes('claude max') || bodyText.includes('max plan')) {
        return 'max';
      }
      if (bodyText.includes('upgrade') || bodyText.includes('subscribe')) {
        return 'free';
      }

      return null;
    }

    detectFromElements() {
      // 检测页面中的订阅相关元素
      const selectors = [
        '[data-testid*="plan"]',
        '[class*="subscription"]',
        '[class*="plan"]',
        '[class*="pro"]',
        '[class*="max"]',
        '.upgrade-button',
        '.subscription-info'
      ];

      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent.toLowerCase();
            if (text.includes('pro')) return 'pro';
            if (text.includes('max')) return 'max';
            if (text.includes('free') || text.includes('upgrade')) return 'free';
          }
        } catch (error) {
          // 忽略选择器错误
        }
      }

      return null;
    }

    detectFromLocalStorage() {
      try {
        // 检查localStorage中的用户信息
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);

          if (value && typeof value === 'string') {
            const lowerValue = value.toLowerCase();
            if (lowerValue.includes('pro') && lowerValue.includes('plan')) {
              return 'pro';
            }
            if (lowerValue.includes('max') && lowerValue.includes('plan')) {
              return 'max';
            }
          }
        }
      } catch (error) {
        console.log('localStorage detection failed:', error);
      }

      return null;
    }

    setPlanLimits(planType) {
      switch (planType) {
        case 'free':
          this.usageData.dailyLimit = 20;
          break;
        case 'pro':
          this.usageData.dailyLimit = 45;
          break;
        case 'max':
          this.usageData.dailyLimit = 200;
          break;
        default:
          this.usageData.dailyLimit = null;
      }
    }

    observeMessageSending() {
      console.log('Claude Usage Monitor: Setting up message observers...');

      // 多种方式监控消息发送
      this.observeByButtonClick();
      this.observeByKeyboard();
      this.observeByFormSubmit();
      // 移除fetch拦截以避免read-only错误
    }

    observeByButtonClick() {
      // 监控所有可能的发送按钮
      const buttonSelectors = [
        'button[type="submit"]',
        '[data-testid*="send"]',
        '[aria-label*="send"]',
        '[aria-label*="Send"]',
        '.send-button',
        '[class*="send"]',
        'button:has(svg)',
        '[role="button"]'
      ];

      const checkAndAddListeners = () => {
        buttonSelectors.forEach(selector => {
          try {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(button => {
              if (!button.hasAttribute('data-usage-monitor')) {
                button.setAttribute('data-usage-monitor', 'true');
                button.addEventListener('click', (e) => {
                  // 检查按钮是否真的是发送按钮
                  const buttonText = button.textContent.toLowerCase();
                  const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

                  if (buttonText.includes('send') || ariaLabel.includes('send') ||
                      button.type === 'submit') {
                    console.log('Send button clicked:', button);
                    setTimeout(() => this.onMessageSent(), 500);
                  }
                });
              }
            });
          } catch (error) {
            // 忽略无效选择器
          }
        });
      };

      // 立即检查
      checkAndAddListeners();

      // 使用MutationObserver监控新按钮
      const observer = new MutationObserver(() => {
        checkAndAddListeners();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.observers.push(observer);
    }

    observeByKeyboard() {
      // 监控Enter键发送（Ctrl+Enter或Shift+Enter）
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey || e.metaKey)) {
          const activeElement = document.activeElement;
          if (activeElement && (
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true' ||
            activeElement.classList.contains('input') ||
            activeElement.getAttribute('role') === 'textbox'
          )) {
            console.log('Enter+Ctrl/Shift detected in input area');
            setTimeout(() => this.onMessageSent(), 1000);
          }
        }
      });
    }

    observeByFormSubmit() {
      // 监控表单提交
      document.addEventListener('submit', (e) => {
        console.log('Form submitted:', e.target);
        setTimeout(() => this.onMessageSent(), 500);
      });
    }

    observeUsageLimits() {
      // 监控用量限制提示的更广泛选择器
      const limitSelectors = [
        '[class*="limit"]',
        '[class*="usage"]',
        '[class*="quota"]',
        '[data-testid*="limit"]',
        '[data-testid*="usage"]',
        '.warning',
        '.alert',
        '[role="alert"]'
      ];

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              limitSelectors.forEach(selector => {
                try {
                  const limitElements = node.querySelectorAll ? node.querySelectorAll(selector) : [];
                  limitElements.forEach(element => {
                    this.parseLimitMessage(element.textContent);
                  });

                  if (node.matches && node.matches(selector)) {
                    this.parseLimitMessage(node.textContent);
                  }
                } catch (error) {
                  // 忽略选择器错误
                }
              });
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.observers.push(observer);
    }

    parseLimitMessage(message) {
      if (!message || typeof message !== 'string') return;

      const lowerMessage = message.toLowerCase();
      console.log('Parsing limit message:', message);

      // 查找百分比信息
      const percentMatch = message.match(/(\d+)%/);
      if (percentMatch) {
        this.usageData.currentUsagePercent = parseInt(percentMatch[1]);
        console.log('Found usage percent:', this.usageData.currentUsagePercent);
      }

      // 查找剩余消息数
      const remainingMatch = message.match(/(\d+)\s*messages?\s*remaining/i);
      if (remainingMatch) {
        const remaining = parseInt(remainingMatch[1]);
        if (this.usageData.dailyLimit) {
          this.usageData.messagesCount = this.usageData.dailyLimit - remaining;
        }
      }

      // 查找总使用数
      const usedMatch = message.match(/(\d+)\s*(?:of|\/)\s*(\d+)\s*messages?/i);
      if (usedMatch) {
        this.usageData.messagesCount = parseInt(usedMatch[1]);
        this.usageData.dailyLimit = parseInt(usedMatch[2]);
      }

      this.saveUsageData();
    }

    onMessageSent() {
      this.messagesSent++;
      this.usageData.messagesCount++;
      this.updateUsagePercent();

      console.log('Message sent! Count:', this.usageData.messagesCount);

      this.saveUsageData();
      this.updateDisplay();

      // 发送消息给后台脚本
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'updateUsageData',
          data: this.usageData
        }).catch(error => {
          console.log('Background script not available:', error);
        });
      }
    }

    updateUsagePercent() {
      if (this.usageData.dailyLimit && this.usageData.dailyLimit > 0) {
        this.usageData.currentUsagePercent = Math.round(
          (this.usageData.messagesCount / this.usageData.dailyLimit) * 100
        );
      } else {
        // 如果没有检测到限制，使用估算
        const estimatedLimit = this.usageData.planType === 'pro' ? 45 :
                             this.usageData.planType === 'max' ? 200 : 20;
        this.usageData.currentUsagePercent = Math.round(
          (this.usageData.messagesCount / estimatedLimit) * 100
        );
      }
    }

    createUsageDisplay() {
      // 移除已存在的显示
      const existing = document.getElementById('claude-usage-display');
      if (existing) {
        existing.remove();
      }

      // 创建新的显示
      const display = document.createElement('div');
      display.id = 'claude-usage-display';
      display.innerHTML = `
        <!-- Inline SVG filter for liquid glass displacement -->
        <svg style="position:absolute;width:0;height:0" aria-hidden="true">
          <defs>
            <filter id="lg-filter-content" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
              <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
                       result="DISPLACEMENT_MAP"
                       href="data:image/jpeg;base64,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cUAUAkEkziomgGgkoxZGgxZFQFQlYnQHRdPfj/10KCSCKESCNiVkViPSLpD0h6I0Q0I0A2IoBWBIJIBKBIJoJIJ2R2J0JWBUJ0JUB0XTv479dFZDYiglYigkhEgjZFQjRFQjRFQjQigFYigHYigmgEgmglYlYnQlQlYlQHQlQnQ9P/kf1yVkNiNCNkNiVENiNiViNEViNkVCVgKCViViViSCViSCVgdCViVCViVCdgVCVCdD1D+U/XBWQ2I0I2Q2JUQ2I0JWQ0I2JUQ2JUI2JUI2J0JWJWJWA2R0BWJ0I2JUJ2BUJUJ0P//EABkQAQEBAQEBAAAAAAAAAAAAAAECABEDEP/aAAgBAQABAgB1atWrVq1atWrVq1atWrVq1atWrVq1atWrVq+OrVq1atWrVq1atWrVq1atWrVq1atWrVq1atXxVppppppdWrVq1atWrVq1NNNNNNNNNNNPVWmmmmms6tWrVq1atWpppppppppppppp6q0000uc51atWrVq1ammmmmmmmmmmmmt1Vpppc5znVq1atWrVqaaaaaaaaaaaaaeqtNLnOc51atWrVq1ammmmmmmmmmmmmnqrS5znOc6tWrVq16222mmmmmmlVppp6tKuc5znOrVq1a9TbbbbTTTTTSq000qtLnOc5zq1atWrW0222200000qqqtKqrnOc5zq1atTbbbbbbbbTTTSqqqqqq5znOc6tTTTbbbbbbbbTTTSqqqqrlVznOctNNNtttttttttNNNNKqqqrqznKqrTTTTbbbbbbbbbTTTSqqqqrqznOc5aaaabbbbbbbbbaaaaVVVVVdWc5znVq1NNttttttttttNNKqqqqudWc5znVq16tbbbbbbbbbbTTSqqqq5XVnOc6tWrVrb1tttttttttNNKqqqqrWrK5VWmmm2230bbbbbbaaaXOc5zlVa1KuVVppptttt9G22222mmlzlVznK6tWVVWmmmm2222222222mlznOc5znLWppVVWmmm22222229bTWrOc5znOcq1qaaVpWmm222222229erVqznOc5znKtatStK0rTbTTbbbberXr1as5znOc5aVpppppWlabaabbbb1ta9WrVnOc5znU0rTTTTTTTTTbTTbbbTWvVq1as5znOdTTStNNNNNNNNNtNNtttN6tWvVq1ZznOrU00rTTTTTTTTTTTTTbTWvVq1atWrOc6tTTTStNNNNNNNNNNtNNtNa9WrVq1Z1Z1NNNNNK1q1NNNNNNNNNNNtNatWrVq1atWrU00000rWrVq1atWrVq1alaaa1atWrVq1NNNammmmla1atWrVq1aterVq16tWrVnVqa1NK1qaaaVX/xAAWEAADAAAAAAAAAAAAAAAAAAAhgJD/2gAIAQEAAz8AaExf/8QAGhEBAQEBAQEBAAAAAAAAAAAAAQISEQADEP/aAAgBAgEBAgDx48ePHjx48ePHjx48ePHjx48ePHjx48ePHj86IiIiIiInjx48ePHjx48IiIiIj0oooooooooRERER73ve60UUUUUUVrWiiiiiihERERER73ve97ooooorRWiiiiihKERERER73ve973RRRRWtFFFFFFCIiIiIiPe973ve60UUVrRRRRRRQiIlCIiI973ve973pRRWiiiiiiiiiiiiiiihEe973ve973RRWtFFFFFFFFFFFFFFFFFFa13ve973WitaKKKKKKKKKKKKKKKKKK1rWtd1rutFa1oooooooooooosssooorWta1rWta1rRRRRRRRRRRZZZZZZZZZWta1rWta1rRRRRRRRRZZZZZZZZZZZZe9a1rWta1rWitaKLLLLLLLLLLLLLLLLL3rWta1rWtFbLLLLLLLLLLLLLLLLLLLL3vWta1rWita1ssssssss+hZZZZZZZZe961rWta0Vre97LLLLLLLLLLLPoWWWWWXrWta1oorWta3ssss+hZZZZ9Cyyyyyyyyiita1orWta1ve9llllllllllllllllFFa0VorWta1ve9llllllllllllllllllFFFaK1rWta1rWiyyyyyyyyyyyyiiiiiiitFFa1rWta1oosoosssssoooosoooorRRRWta1rWta0UUUUUWUUUUUUUUUUUVoooorWta1rWtaKKKKKKmiiiiiiiiiiiiiiitd73ve61oSiiipoqaKKKKKKKKKK0UUUVrve973vREREZoSihEooooorRRRRWtd73ve9EREREREoSiiiiitFllllla73ve9ERERERESiiiiiitH0PoWWWWVrXe96IiIiMoiJRRRRRRWjwlFFllllFFd6IiIiIlCUUUUUUUUUePHjx48ePCIiIiIiIiUUUUUUUUUUUePHjx48ePHjx48ePHjx48IiUUUUUUJRRRX//xAAWEQADAAAAAAAAAAAAAAAAAAABYJD/2gAIAQIBAz8AtEV7/8QAFxEBAQEBAAAAAAAAAAAAAAAAAAECEP/aAAgBAwEBAgCtNNNNNNNNNNNNNNNNNNNNNNNNNNNNNcrTTTTTTTTTTTTTTTTTTTTTTTTTTTTTXKrTTTTTTTU000000000000000000001FVpppppqampqaaaaaaaaaaaaaaaaaaaa5Vaaaaampqampqammmmmmmmmmmlaaaaaaiq0001NTU1NTU1NTTTTTTTTTTSqqtNNNcqtNNSyzU1LNTU1NTTTTTTTTTSqqq001ytNLLLLNTU1NTU1NTbbbTTTTTSqqq001ytNLLLLLNTU1NTU3NttttNNNNNKqq001KrSyyyyyzU1NTU3Nzc02220000qqqqrSqqyyyyyzU1NTU3Nzc3NttttNNNNNKqqqqqqssssss1NTU3Nzc3NzbbbbTTTSqqqqqqrLLLLLNTU1Nzc3Nzc22220000qqqqqqqqssss1NTU3Nzc3NzbbbbbTTSqqqqqqqqqqzU1NTc3Nzc3Nzbc22000qqqqqqqqqqqtTU3Nzc3Nzc3NtzbTTSqqqqrKqqqqqtNNzc23Nzc3Nzc3NTU1KqqqrKqqqqqtNNNNttzc3Nzc3NzU1NLLLLLKqqqqqqqq0022223Nzc3NzU1NSyyyyyyqqqqqqqrTTbbbbc3Nzc3NTU1LLLLLLKsqqqqqqrTTTTbbbc3Nzc1NTUsssssssqqqqqqrTTTTTbbbTc3NTU1NTUsssssqqqqqqqq0000222023NTU1NTUsssssqqqqqqqq000000003NTU1NTU1LLLLLNKrTSqqqqtNNNNNNtNNTU1NSzUssss00qq0qqqqrTTTTTTTTTU1NTUs1LLLNNNKrTTTSqqq00000000001NTU1LNTU0000qtNNNKqqqtNNNNNNNNTU1NTUs1NNNNNKss1NNNK00qtK0000001NNTU0s000000qq000001NKrStNNNNK1NNNNStNNNNNKqtNNNNNNNK0000000rU0000rTTTTTSq00000rTTTTTTTTTTTTTTTTStNNNNKr/xAAUEQEAAAAAAAAAAAAAAAAAAACg/9oACAEDAQM/AAAf/9k="/>
              <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale="22" xChannelSelector="R" yChannelSelector="B" />
            </filter>
          </defs>
        </svg>

        <div class="lg-glass">
          <span class="lg-warp" style="filter: url(#lg-filter-content);"></span>
          <div class="usage-header">
            <span class="usage-title"><span class="claude-brand">Claude</span> Usage</span>
            <button class="usage-toggle" type="button">−</button>
          </div>
          <div class="usage-content" style="display: block;">
            <div class="usage-item">
              <span class="usage-label">Plan:</span>
              <span class="usage-value" id="plan-type">${this.usageData.planType}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">Model:</span>
              <span class="usage-value" id="model-display">${this.usageData.modelDisplay || 'Unknown Model'}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">Usage:</span>
              <span class="usage-value" id="usage-percent">${this.usageData.currentUsagePercent}%</span>
            </div>
            <div class="usage-progress">
              <div class="progress-bar" id="progress-bar" style="width: ${this.usageData.currentUsagePercent}%"></div>
            </div>
            <div class="limit-timer" id="limit-timer" style="display:none;margin-top:6px;color: var(--claude-accent, #A9553A); font-weight:600; font-size: 12px;">
              Resets in: --
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(display);

      // 添加切换功能
      const toggleButton = display.querySelector('.usage-toggle');
      const content = display.querySelector('.usage-content');

      if (toggleButton && content) {
        toggleButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const isVisible = content.style.display !== 'none';
          content.style.display = isVisible ? 'none' : 'block';
          toggleButton.textContent = isVisible ? '+' : '−';
          this.displayCollapsed = isVisible;

          console.log('Toggle clicked, collapsed:', this.displayCollapsed);
        });
      }


      // 使元素可拖拽
      this.makeDraggable(display);

      console.log('Usage display created');
    }

    makeDraggable(element) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      let isDragging = false;
      const header = element.querySelector('.usage-header');

      header.style.cursor = 'move';
      header.onmousedown = dragMouseDown;

      // Add mouse tracking for liquid glass effects
      this.addMouseTracking(element);

      function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        isDragging = true;
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
      }

      function closeDragElement() {
        isDragging = false;
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }

    addMouseTracking(element) {
      let mouseX = 0, mouseY = 0;
      let elementX = 0, elementY = 0;

      const updateGlassEffect = () => {
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = mouseX - centerX;
        const deltaY = mouseY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Activation zone: 200px from center
        const activationZone = 200;

        if (distance < activationZone) {
          const intensity = 1 - (distance / activationZone);
          const offsetX = (deltaX / centerX) * 10 * intensity;
          const offsetY = (deltaY / centerY) * 10 * intensity;

          // Apply subtle transform and enhance backdrop blur
          element.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${1 + intensity * 0.02})`;
          element.style.backdropFilter = `blur(${24 + intensity * 8}px) saturate(${180 + intensity * 20}%) brightness(${1.1 + intensity * 0.1})`;

          // Dynamic border gradient based on mouse position
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
          const header = element.querySelector('.usage-header');
          if (header) {
            header.style.background = `linear-gradient(${angle + 135}deg,
              rgba(255, 255, 255, ${0.08 + intensity * 0.05}) 0%,
              rgba(255, 255, 255, ${0.03 + intensity * 0.02}) 50%,
              rgba(255, 255, 255, ${0.08 + intensity * 0.05}) 100%)`;
          }
        } else {
          // Reset to default state
          element.style.transform = '';
          element.style.backdropFilter = '';
          const header = element.querySelector('.usage-header');
          if (header) {
            header.style.background = '';
          }
        }
      };

      // Track mouse movement
      document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        requestAnimationFrame(updateGlassEffect);
      });

      // Add hover effects
      element.addEventListener('mouseenter', () => {
        element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      });

      element.addEventListener('mouseleave', () => {
        // Smooth return to default state
        element.style.transform = '';
        element.style.backdropFilter = '';
        const header = element.querySelector('.usage-header');
        if (header) {
          header.style.background = '';
        }
      });
    }

    updateDisplay() {
      const planType = document.getElementById('plan-type');
      const modelDisplayEl = document.getElementById('model-display');
      const usagePercentEl = document.getElementById('usage-percent');
      const progressBar = document.getElementById('progress-bar');
      const limitTimerEl = document.getElementById('limit-timer');

      if (planType) planType.textContent = this.usageData.planType;
      if (modelDisplayEl) modelDisplayEl.textContent = this.usageData.modelDisplay || 'Unknown Model';

      const now = Date.now();
      const limitActive = !!this.usageData.limitActive;
      const resetMs = this.usageData.limitResetTime ? new Date(this.usageData.limitResetTime).getTime() : 0;
      const hasOfficialReset = resetMs && now < resetMs;

      if (progressBar) {
        if (limitActive) {
          progressBar.style.width = '100%';
          progressBar.className = 'progress-bar normal';
          if (usagePercentEl) usagePercentEl.textContent = 'Limit Reached';
          if (limitTimerEl) {
            if (hasOfficialReset) {
              limitTimerEl.style.display = 'block';
              limitTimerEl.textContent = `Resets in: ${this.formatRemainingTime(resetMs - now)}`;
            } else {
              limitTimerEl.style.display = 'none';
            }
          }
        } else {
          if (usagePercentEl) usagePercentEl.textContent = `${this.usageData.currentUsagePercent}%`;
          progressBar.style.width = `${this.usageData.currentUsagePercent}%`;
          progressBar.className = 'progress-bar normal';
          if (limitTimerEl) limitTimerEl.style.display = 'none';
        }
      }
    }

    async updateUsageData() {
      // 定期检查是否有新的用量信息
      try {
        await this.detectPlanType();
        await this.detectCurrentModel();
        await this.checkLimitState();
        this.updateDisplay();
      } catch (error) {
        console.log('Update error:', error);
      }
    }
    // Detect current Claude model from page
    async detectCurrentModel() {
      try {
        const texts = [];
        const pushText = (el) => {
          if (!el) return;
          const t = (el.innerText || el.textContent || '').trim();
          if (t) texts.push(t);
          const al = el.getAttribute && el.getAttribute('aria-label');
          if (al) texts.push(al);
        };
        // Common places: model selector button, dropdown, toolbar
        document.querySelectorAll('[data-testid*="model" i], [aria-label*="model" i], button, [role="button"], [class*="model" i]').forEach(pushText);
        // Try page title too
        if (document.title) texts.push(document.title);
        const blob = texts.join(' | ');
        const modelRegex = /(claude\s*)?(?<version>3\.5|3|4(?:\.\d+)?)?\s*(?<name>opus|sonnet|haiku)\s*(?<postver>\d+(?:\.\d+)?)?/i;
        const m = blob.match(modelRegex);
        if (m && m.groups) {
          const name = m.groups.name ? m.groups.name.charAt(0).toUpperCase() + m.groups.name.slice(1).toLowerCase() : '';
          const ver = m.groups.version || m.groups.postver || '';
          let display;
          if (ver) {
            // If version captured as leading (3.5/3/4/4.1)
            if (/^(3(\.5)?)$/.test(ver)) display = `Claude ${ver} ${name}`;
            else display = `Claude ${name} ${ver}`; // e.g., Opus 4.1
          } else {
            display = `Claude ${name}`;
          }
          if (display && display !== this.usageData.modelDisplay) {
            this.usageData.modelDisplay = display;
            await this.saveUsageData();
          }
        }
      } catch (e) {
        // swallow
      }
    }

    // Check 5-hour limit by disabled input/send or limit text, persist countdown
    async checkLimitState() {
      const now = Date.now();
      const sendDisabled = !!document.querySelector('button[disabled], button[aria-disabled="true"], button:disabled');
      const inputDisabled = !!document.querySelector('textarea[disabled], textarea:disabled, [contenteditable="false"], [contenteditable][aria-disabled="true"]');
      const bannerHit = /limit|5\s*hour/i.test(document.body.textContent || '');
      const hit = sendDisabled || inputDisabled || bannerHit;

      if (hit) {
        // Mark active
        if (!this.usageData.limitActive) {
          this.usageData.limitActive = true;
          this.usageData.limitHitTime = new Date(now).toISOString();
        }
        // Try to parse official remaining time; only set reset when we have it
        const officialResetMs = this.tryParseOfficialResetMs();
        if (officialResetMs) {
          this.usageData.limitResetTime = new Date(officialResetMs).toISOString();
          this.startLimitTicker();
        }
        this.usageData.currentUsagePercent = 100;
        await this.saveUsageData();
      } else {
        // If UI re-enabled or passed reset, clear
        const reset = this.usageData.limitResetTime ? new Date(this.usageData.limitResetTime).getTime() : 0;
        if (this.usageData.limitActive && (!reset || now >= reset)) {
          this.clearLimitState();
          await this.saveUsageData();
        }
      }
    }

    startLimitTicker() {
      if (this._limitTicker) return;
      this._limitTicker = setInterval(() => {
        const now = Date.now();
        const reset = this.usageData.limitResetTime ? new Date(this.usageData.limitResetTime).getTime() : 0;
        if (!this.usageData.limitActive || !reset || now >= reset) {
          this.stopLimitTicker();
          this.clearLimitState();
          this.updateDisplay();
          this.saveUsageData();
          return;
        }
        this.updateDisplay();
      }, 1000);
    }

    stopLimitTicker() {
      if (this._limitTicker) {
        clearInterval(this._limitTicker);
        this._limitTicker = null;
      }
    }

    clearLimitState() {
      this.usageData.limitActive = false;
      this.usageData.limitHitTime = null;
      this.usageData.limitResetTime = null;
      // keep currentUsagePercent as-is; will be recalculated by normal flow
    }

    // Parse official reset time from visible UI texts; return absolute ms (epoch) or 0
    tryParseOfficialResetMs() {
      try {
        const now = Date.now();
        const candidates = [];
        const sel = [
          '[aria-live]', '[role="status"]', '[role="alert"]',
          '[class*="limit" i]', '[class*="banner" i]', '[class*="toast" i]',
          '[data-testid*="limit" i]', '[class*="approaching" i]'
        ].join(',');
        document.querySelectorAll(sel).forEach(el => {
          // skip our own injected panel to avoid reading "Resets in: ..." from ourselves
          if (el.closest && el.closest('#claude-usage-display')) return;
          const t = (el.innerText || el.textContent || '').trim();
          if (t) candidates.push(t);
        });
        // also try title and sanitized body text as a last resort
        if (document.title) candidates.push(document.title);
        let bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
        if (bodyText) {
          // remove our own timer line if present
          bodyText = bodyText.replace(/Resets in:\s*\d+\s*h\s*\d+\s*m/ig, '');
          candidates.push(bodyText);
        }
        for (const text of candidates) {
          // Prefer absolute reset time if present (e.g., "resets 1:00 PM")
          const abs = this.parseAbsoluteResetMsFromText(text);
          if (abs && abs > now) return abs;
          // Otherwise handle relative duration (e.g., "Resets in 4h 58m")
          const delta = this.parseRemainingMsFromText(text);
          if (delta > 0) return now + delta;
        }
      } catch (e) {
        // noop
      }
      return 0;
    }

    // Parse strings like "Resets in 4h 58m", "about 2 hours", "23 minutes" -> remaining ms
    parseRemainingMsFromText(text) {
      if (!text) return 0;
      const s = String(text).toLowerCase();
      // quick filter: only try if contains reset/limit time hints
      if (!/(reset|resets|left|remaining|limit|hour|min)/i.test(s)) return 0;
      let h = 0, m = 0;
      // capture patterns
      const hMatch = s.match(/(\d+)\s*h(?!z)/i) || s.match(/(\d+)\s*hour/i) || s.match(/(\d+)\s*hours/i);
      const mMatch = s.match(/(\d+)\s*m(?!s)/i) || s.match(/(\d+)\s*min/i) || s.match(/(\d+)\s*mins/i) || s.match(/(\d+)\s*minute/i) || s.match(/(\d+)\s*minutes/i);
      if (hMatch) h = parseInt(hMatch[1], 10) || 0;
      if (mMatch) m = parseInt(mMatch[1], 10) || 0;
      const total = h * 60 + m;
      return total > 0 ? total * 60 * 1000 : 0;
    }

    // Parse absolute reset time like "resets 1:00 PM" or "resets at 13:05" -> epoch ms
    parseAbsoluteResetMsFromText(text) {
      if (!text) return 0;
      const s = String(text).toLowerCase();
      if (!/(reset|resets)/i.test(s)) return 0;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      // 12-hour with minutes, e.g. 1:05 pm
      let m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (m) {
        let hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        const ap = m[3];
        if (/pm/i.test(ap) && hour < 12) hour += 12;
        if (/am/i.test(ap) && hour === 12) hour = 0;
        const d = new Date(today);
        d.setHours(hour, minute, 0, 0);
        let ts = d.getTime();
        if (ts <= now.getTime()) ts += 24 * 60 * 60 * 1000; // tomorrow
        return ts;
      }

      // 12-hour without minutes, e.g. 1 pm
      m = s.match(/\b(\d{1,2})\s*(am|pm)\b/i);
      if (m) {
        let hour = parseInt(m[1], 10);
        const ap = m[2];
        if (/pm/i.test(ap) && hour < 12) hour += 12;
        if (/am/i.test(ap) && hour === 12) hour = 0;
        const d = new Date(today);
        d.setHours(hour, 0, 0, 0);
        let ts = d.getTime();
        if (ts <= now.getTime()) ts += 24 * 60 * 60 * 1000;
        return ts;
      }

      // 24-hour, e.g. 13:05
      m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (m) {
        const hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        const d = new Date(today);
        d.setHours(hour, minute, 0, 0);
        let ts = d.getTime();
        if (ts <= now.getTime()) ts += 24 * 60 * 60 * 1000;
        return ts;
      }

      return 0;
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
        if (chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ claudeUsageData: this.usageData });
        }
      } catch (error) {
        console.error('Failed to save usage data:', error);
      }
    }

    async loadUsageData() {
      try {
        if (chrome.storage && chrome.storage.local) {
          const result = await chrome.storage.local.get(['claudeUsageData']);
          if (result.claudeUsageData) {
            this.usageData = { ...this.usageData, ...result.claudeUsageData };

            // 检查是否需要每日重置
            const today = new Date().toDateString();
            if (this.usageData.lastResetTime !== today) {
              this.usageData.messagesCount = 0;
              this.usageData.currentUsagePercent = 0;
              this.usageData.lastResetTime = today;
            }
          }
        }
      } catch (error) {
        console.error('Failed to load usage data:', error);
      }
    }

    destroy() {
      // 清理观察器
      this.observers.forEach(observer => observer.disconnect());

      // 移除显示元素
      const display = document.getElementById('claude-usage-display');
      if (display) {
        display.remove();
      }
    }
  }

  // 检查是否在Claude网站上
  if (window.location.hostname === 'claude.ai') {
    const monitor = new ClaudeUsageMonitor();

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      monitor.destroy();
    });

    // 暴露给全局，方便调试
    window.claudeUsageMonitor = monitor;

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'getUsageData') {
        sendResponse({
          success: true,
          usageData: monitor.usageData
        });
        return true;

      }

    });
  }

})();