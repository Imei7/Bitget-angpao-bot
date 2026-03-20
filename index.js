/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                  🧧 TELEGRAM ANGPAO SNIPER BOT v2.0.0 🧧                  ║
 * ║                                                                           ║
 * ║  Production-Grade X (Twitter) Monitor dengan Rate Limiting & Anti-Ban    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * 
 * Fitur Utama:
 * - Multi-account monitoring dengan parallel processing
 * - Smart rate limiting & request queue
 * - Circuit breaker untuk setiap endpoint
 * - Adaptive polling interval
 * - Self-healing system
 * - Anti-crash protection
 * - In-memory cache + file fallback
 * 
 * @author Senior Backend Engineer
 * @version 2.0.0
 */

import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ==================== KONFIGURASI ES Module ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== KONFIGURASI UTAMA ====================

const CONFIG = {
  // Environment variables
  BOT_TOKEN: process.env.BOT_TOKEN,
  CHAT_ID: process.env.CHAT_ID,
  
  // Akun yang dimonitor
  ACCOUNTS: [
    'BitgetWalletSA',
    'BitgetWalletPK',
    'BitgetWalletID'
  ],
  
  // Keyword utama (wajib ada minimal 1)
  PRIMARY_KEYWORDS: ['angpao', 'red packet', '红包'],
  
  // Keyword konteks (boost prioritas, tidak wajib)
  CONTEXT_KEYWORDS: ['claim', 'join now', 'first come', 'limited', 'giveaway', 'free'],
  
  // Nitter endpoints
  NITTER_ENDPOINTS: [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.privacydev.net',
    'https://nitter.rawbit.io',
    'https://nitter.d420.de'
  ],
  
  // Polling configuration
  BASE_POLL_INTERVAL: 10000,      // 10 detik base
  MIN_POLL_INTERVAL: 8000,        // Minimum 8 detik
  MAX_POLL_INTERVAL: 60000,       // Maximum 60 detik (saat semua endpoint gagal)
  JITTER_RANGE: 2000,             // ±2 detik jitter
  
  // Request configuration
  REQUEST_TIMEOUT: 8000,          // 8 detik timeout
  MAX_CONCURRENT_REQUESTS: 2,     // Maksimal 2 request paralel
  MIN_REQUEST_DELAY: 800,         // Delay minimum antar request
  MAX_REQUEST_DELAY: 1500,        // Delay maksimum antar request
  
  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 10,    // Maksimal 10 request per menit per endpoint
  ENDPOINT_COOLDOWN: 60000,       // 60 detik cooldown
  
  // Circuit breaker
  MAX_FAILURES: 3,                // Maksimal 3 failure sebelum circuit breaker
  CIRCUIT_OPEN_TIME: 60000,       // 60 detik circuit breaker open
  
  // Retry configuration
  MAX_RETRIES: 1,                 // 1 retry per request
  
  // State file
  STATE_FILE: path.join(__dirname, 'last.json')
};

// ==================== VALIDASI ENVIRONMENT ====================

if (!CONFIG.BOT_TOKEN || !CONFIG.CHAT_ID) {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('❌ ERROR: Environment variables tidak lengkap!');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('');
  console.error('Variables yang diperlukan:');
  console.error('  • BOT_TOKEN - Token bot Telegram dari @BotFather');
  console.error('  • CHAT_ID   - ID chat tujuan untuk mengirim alert');
  console.error('');
  console.error('Cara setting:');
  console.error('  export BOT_TOKEN="your_bot_token"');
  console.error('  export CHAT_ID="your_chat_id"');
  console.error('');
  process.exit(1);
}

// ==================== UTILITAS ====================

/**
 * Logger dengan format yang konsisten
 */
const Logger = {
  prefix: '[ANGPAO-BOT]',
  
  timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  },
  
  format(level, message) {
    return `${this.timestamp()} ${level} ${message}`;
  },
  
  info(message) {
    console.log(this.format('✅', message));
  },
  
  warn(message) {
    console.log(this.format('⚠️', message));
  },
  
  error(message) {
    console.log(this.format('❌', message));
  },
  
  debug(message) {
    if (process.env.DEBUG === 'true') {
      console.log(this.format('🔍', message));
    }
  },
  
  fetch(message) {
    console.log(this.format('🔄', message));
  },
  
  alert(message) {
    console.log(this.format('🧧', message));
  },
  
  block(message) {
    console.log(this.format('🚫', message));
  },
  
  heal(message) {
    console.log(this.format('💊', message));
  }
};

/**
 * Sleep function dengan jitter
 */
function sleep(ms, jitter = 0) {
  const actualMs = ms + (jitter > 0 ? Math.random() * jitter * 2 - jitter : 0);
  return new Promise(resolve => setTimeout(resolve, Math.max(0, actualMs)));
}

/**
 * Generate random number dalam range
 */
function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Escape Markdown untuk Telegram (tanpa escape dot)
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/-/g, '\\-')
    .replace(/\+/g, '\\+')
    .replace(/!/g, '\\!')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/#/g, '\\#')
    .replace(/>/g, '\\>')
    .replace(/</g, '\\<')
    .replace(/~/g, '\\~');
}

// ==================== STATE MANAGER ====================

/**
 * State Manager dengan in-memory cache dan file fallback
 */
const StateManager = {
  // In-memory cache (primary)
  cache: {},
  
  // Flag untuk perubahan
  dirty: false,
  
  /**
   * Load state dari file ke memory
   */
  load() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        const data = fs.readFileSync(CONFIG.STATE_FILE, 'utf8');
        this.cache = JSON.parse(data);
        Logger.info(`State loaded dari file: ${Object.keys(this.cache).length} akun`);
      } else {
        // Inisialisasi state kosong
        this.cache = {};
        CONFIG.ACCOUNTS.forEach(acc => {
          this.cache[acc] = { lastTweetId: null, lastCheck: null };
        });
        this.save();
        Logger.info('State file baru dibuat');
      }
    } catch (error) {
      Logger.warn(`Gagal load state file: ${error.message}`);
      // Inisialisasi dengan cache kosong
      this.cache = {};
      CONFIG.ACCOUNTS.forEach(acc => {
        this.cache[acc] = { lastTweetId: null, lastCheck: null };
      });
    }
  },
  
  /**
   * Simpan state ke file
   */
  save() {
    try {
      fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.cache, null, 2));
      this.dirty = false;
    } catch (error) {
      Logger.warn(`Gagal save state file: ${error.message}`);
    }
  },
  
  /**
   * Update state untuk akun tertentu
   */
  update(username, tweetId) {
    if (!this.cache[username]) {
      this.cache[username] = { lastTweetId: null, lastCheck: null };
    }
    this.cache[username].lastTweetId = tweetId;
    this.cache[username].lastCheck = new Date().toISOString();
    this.dirty = true;
    
    // Save ke file (non-blocking)
    setImmediate(() => this.save());
  },
  
  /**
   * Get last tweet ID untuk akun
   */
  getLastTweetId(username) {
    return this.cache[username]?.lastTweetId || null;
  },
  
  /**
   * Get semua state
   */
  getAll() {
    return { ...this.cache };
  }
};

// ==================== CIRCUIT BREAKER ====================

/**
 * Status circuit breaker
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal, request diperbolehkan
  OPEN: 'OPEN',         // Blocked, terlalu banyak failure
  HALF_OPEN: 'HALF_OPEN' // Testing, 1 request test diperbolehkan
};

/**
 * Circuit Breaker untuk setiap endpoint
 */
const CircuitBreaker = {
  endpoints: {},
  
  /**
   * Inisialisasi semua endpoint
   */
  init() {
    CONFIG.NITTER_ENDPOINTS.forEach(endpoint => {
      this.endpoints[endpoint] = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailure: null,
        lastSuccess: null,
        lastUsed: null,
        requestCount: 0,
        requestCountReset: Date.now() + 60000,
        cooldownUntil: null
      };
    });
    Logger.info(`Circuit breaker initialized untuk ${CONFIG.NITTER_ENDPOINTS.length} endpoint`);
  },
  
  /**
   * Check apakah endpoint tersedia
   */
  isAvailable(endpoint) {
    const ep = this.endpoints[endpoint];
    if (!ep) return false;
    
    const now = Date.now();
    
    // Reset request count setiap menit
    if (now > ep.requestCountReset) {
      ep.requestCount = 0;
      ep.requestCountReset = now + 60000;
    }
    
    // Check rate limit
    if (ep.requestCount >= CONFIG.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }
    
    // Check circuit state
    switch (ep.state) {
      case CircuitState.CLOSED:
        return true;
        
      case CircuitState.OPEN:
        // Check apakah cooldown sudah selesai
        if (ep.cooldownUntil && now >= ep.cooldownUntil) {
          ep.state = CircuitState.HALF_OPEN;
          Logger.heal(`Circuit HALF-OPEN untuk ${endpoint}`);
          return true;
        }
        return false;
        
      case CircuitState.HALF_OPEN:
        // Hanya 1 request test diperbolehkan
        return true;
        
      default:
        return false;
    }
  },
  
  /**
   * Record success untuk endpoint
   */
  recordSuccess(endpoint) {
    const ep = this.endpoints[endpoint];
    if (!ep) return;
    
    ep.successCount++;
    ep.lastSuccess = Date.now();
    ep.requestCount++;
    ep.lastUsed = Date.now();
    
    // Reset failure count dan close circuit
    if (ep.state === CircuitState.HALF_OPEN) {
      ep.failureCount = 0;
      ep.state = CircuitState.CLOSED;
      Logger.heal(`Circuit CLOSED (recovered) untuk ${endpoint}`);
    }
  },
  
  /**
   * Record failure untuk endpoint
   */
  recordFailure(endpoint) {
    const ep = this.endpoints[endpoint];
    if (!ep) return;
    
    ep.failureCount++;
    ep.lastFailure = Date.now();
    ep.requestCount++;
    
    Logger.warn(`Failure #${ep.failureCount} untuk ${endpoint}`);
    
    // Check apakah harus open circuit
    if (ep.failureCount >= CONFIG.MAX_FAILURES) {
      ep.state = CircuitState.OPEN;
      ep.cooldownUntil = Date.now() + CONFIG.CIRCUIT_OPEN_TIME;
      Logger.block(`Circuit OPEN untuk ${endpoint} (cooldown ${CONFIG.CIRCUIT_OPEN_TIME/1000}s)`);
    }
  },
  
  /**
   * Get endpoint terbaik (least failures, not in cooldown)
   */
  getBestEndpoint() {
    const now = Date.now();
    const available = [];
    
    for (const [endpoint, data] of Object.entries(this.endpoints)) {
      if (this.isAvailable(endpoint)) {
        available.push({
          endpoint,
          failureCount: data.failureCount,
          lastUsed: data.lastUsed || 0
        });
      }
    }
    
    if (available.length === 0) {
      return null;
    }
    
    // Sort by: lowest failure count, then least recently used
    available.sort((a, b) => {
      if (a.failureCount !== b.failureCount) {
        return a.failureCount - b.failureCount;
      }
      return a.lastUsed - b.lastUsed;
    });
    
    return available[0].endpoint;
  },
  
  /**
   * Get statistik semua endpoint
   */
  getStats() {
    const stats = {};
    for (const [endpoint, data] of Object.entries(this.endpoints)) {
      stats[endpoint] = {
        state: data.state,
        failures: data.failureCount,
        successes: data.successCount,
        requests: data.requestCount
      };
    }
    return stats;
  },
  
  /**
   * Check kesehatan sistem
   */
  getHealthStatus() {
    const endpoints = Object.values(this.endpoints);
    const healthy = endpoints.filter(e => e.state === CircuitState.CLOSED).length;
    const total = endpoints.length;
    
    return {
      healthy,
      total,
      ratio: healthy / total,
      status: healthy === 0 ? 'critical' : 
              healthy < total / 2 ? 'degraded' : 'healthy'
    };
  }
};

// ==================== REQUEST QUEUE ====================

/**
 * Request Queue untuk mengontrol concurrent requests
 */
const RequestQueue = {
  queue: [],
  activeRequests: 0,
  isProcessing: false,
  
  /**
   * Tambah request ke queue
   */
  async add(requestFn, label = 'request') {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: requestFn,
        label,
        resolve,
        reject
      });
      
      this.process();
    });
  },
  
  /**
   * Process queue
   */
  async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (this.queue.length > 0 && this.activeRequests < CONFIG.MAX_CONCURRENT_REQUESTS) {
      const task = this.queue.shift();
      this.activeRequests++;
      
      // Jalankan request dengan delay
      this.executeTask(task)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.activeRequests--;
          this.process();
        });
      
      // Delay sebelum request berikutnya
      if (this.queue.length > 0) {
        const delay = randomInRange(CONFIG.MIN_REQUEST_DELAY, CONFIG.MAX_REQUEST_DELAY);
        await sleep(delay);
      }
    }
    
    this.isProcessing = false;
  },
  
  /**
   * Execute single task
   */
  async executeTask(task) {
    return await task.fn();
  },
  
  /**
   * Get queue status
   */
  getStatus() {
    return {
      pending: this.queue.length,
      active: this.activeRequests,
      isProcessing: this.isProcessing
    };
  }
};

// ==================== ADAPTIVE POLLING ====================

/**
 * Adaptive Polling Controller
 */
const AdaptivePolling = {
  currentInterval: CONFIG.BASE_POLL_INTERVAL,
  consecutiveFailures: 0,
  lastAdjustment: Date.now(),
  
  /**
   * Hitung interval berikutnya berdasarkan kondisi
   */
  getNextInterval() {
    const health = CircuitBreaker.getHealthStatus();
    let baseInterval = this.currentInterval;
    
    switch (health.status) {
      case 'healthy':
        // Semua endpoint sehat, gunakan base interval
        baseInterval = CONFIG.BASE_POLL_INTERVAL;
        this.consecutiveFailures = 0;
        break;
        
      case 'degraded':
        // Beberapa endpoint bermasalah, tingkatkan interval
        baseInterval = Math.min(
          CONFIG.BASE_POLL_INTERVAL * 1.5,
          CONFIG.MAX_POLL_INTERVAL / 2
        );
        break;
        
      case 'critical':
        // Semua endpoint bermasalah, gunakan interval maksimal
        baseInterval = CONFIG.MAX_POLL_INTERVAL;
        this.consecutiveFailures++;
        break;
    }
    
    // Tambah jitter
    const jitter = Math.random() * CONFIG.JITTER_RANGE * 2 - CONFIG.JITTER_RANGE;
    const finalInterval = Math.max(CONFIG.MIN_POLL_INTERVAL, baseInterval + jitter);
    
    this.currentInterval = finalInterval;
    return finalInterval;
  },
  
  /**
   * Record failure untuk adjustment
   */
  recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures > 3) {
      this.currentInterval = Math.min(
        this.currentInterval * 1.5,
        CONFIG.MAX_POLL_INTERVAL
      );
    }
  },
  
  /**
   * Record success
   */
  recordSuccess() {
    this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
    if (this.consecutiveFailures === 0) {
      this.currentInterval = CONFIG.BASE_POLL_INTERVAL;
    }
  }
};

// ==================== DETECTION ENGINE ====================

/**
 * Deteksi keyword dalam teks
 */
function containsKeyword(text) {
  if (!text) return { hasKeyword: false, hasContext: false, keywords: [] };
  
  const lowerText = text.toLowerCase();
  const foundKeywords = [];
  let hasPrimary = false;
  let hasContext = false;
  
  // Check primary keywords
  for (const keyword of CONFIG.PRIMARY_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      hasPrimary = true;
      foundKeywords.push(keyword);
    }
  }
  
  // Check context keywords
  for (const keyword of CONFIG.CONTEXT_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      hasContext = true;
    }
  }
  
  return {
    hasKeyword: hasPrimary,
    hasContext,
    keywords: foundKeywords,
    priority: hasPrimary && hasContext ? 'high' : hasPrimary ? 'normal' : 'none'
  };
}

/**
 * Extract URLs dari teks
 */
function extractLinks(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract claim codes dari teks
 */
function extractCodes(text) {
  if (!text) return [];
  // Pattern: uppercase letters dan numbers, minimal 5 karakter
  const codeRegex = /\b[A-Z0-9]{5,}\b/g;
  const matches = text.match(codeRegex);
  
  if (!matches) return [];
  
  // Filter out common false positives
  const falsePositives = ['HTTP', 'HTTPS', 'HTML', 'JSON', 'TWITTER', 'STATUS'];
  return [...new Set(matches)].filter(code => !falsePositives.includes(code));
}

/**
 * Validasi tweet
 */
function validateTweet(text) {
  const keywordResult = containsKeyword(text);
  const links = extractLinks(text);
  const codes = extractCodes(text);
  
  const isValid = keywordResult.hasKeyword && (links.length > 0 || codes.length > 0);
  
  return {
    isValid,
    keywordResult,
    links,
    codes,
    priority: keywordResult.priority
  };
}

// ==================== SCRAPER ENGINE ====================

/**
 * Safe fetch wrapper dengan timeout dan retry
 */
async function safeFetch(url, endpoint) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    if (!html || html.length < 100) {
      throw new Error('Empty response');
    }
    
    return { success: true, html };
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    const errorType = error.name === 'AbortError' ? 'Timeout' : error.message;
    return { success: false, error: errorType };
  }
}

/**
 * Parse HTML dari Nitter
 */
function parseNitterHtml(html, username) {
  try {
    // Extract tweet ID dari link
    const idPatterns = [
      /href="\/[^\/]+\/status\/(\d+)"/,
      /status\/(\d+)/,
      /data-status="(\d+)"/
    ];
    
    let tweetId = null;
    for (const pattern of idPatterns) {
      const match = html.match(pattern);
      if (match) {
        tweetId = match[1];
        break;
      }
    }
    
    if (!tweetId) {
      Logger.debug(`Tweet ID tidak ditemukan untuk @${username}`);
      return null;
    }
    
    // Extract tweet text - multiple patterns untuk robustness
    let tweetText = '';
    const textPatterns = [
      /class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="tweet-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div class="tweet-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const pattern of textPatterns) {
      const match = html.match(pattern);
      if (match) {
        tweetText = match[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        break;
      }
    }
    
    // Extract links dari tweet content
    const links = [];
    
    // Pattern untuk links di Nitter
    const linkPatterns = [
      /<a[^>]*href="([^"]+)"[^>]*class="[^"]*link[^"]*"[^>]*>/gi,
      /<a[^>]*href="((https?:)?\/\/[^\s"]+)"[^>]*>/gi
    ];
    
    for (const pattern of linkPatterns) {
      let linkMatch;
      while ((linkMatch = pattern.exec(html)) !== null) {
        let link = linkMatch[1];
        
        // Skip Nitter internal links
        if (link.startsWith('/') && !link.startsWith('//')) continue;
        
        // Convert relative to absolute if needed
        if (link.startsWith('//')) {
          link = 'https:' + link;
        }
        
        if (link.startsWith('http')) {
          links.push(link);
        }
      }
    }
    
    // Also extract from text using regex
    const textLinks = extractLinks(tweetText);
    
    return {
      tweetId,
      username,
      text: tweetText,
      links: [...new Set([...links, ...textLinks])]
    };
    
  } catch (error) {
    Logger.warn(`Parse error untuk @${username}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch tweet dengan endpoint rotation dan queue
 */
async function fetchTweet(username) {
  return RequestQueue.add(async () => {
    let lastError = null;
    
    for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      // Get best available endpoint
      const endpoint = CircuitBreaker.getBestEndpoint();
      
      if (!endpoint) {
        Logger.block(`Semua endpoint dalam cooldown untuk @${username}`);
        return null;
      }
      
      const url = `${endpoint}/${username}`;
      
      Logger.fetch(`@${username} via ${endpoint}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
      
      const result = await safeFetch(url, endpoint);
      
      if (result.success) {
        const tweetData = parseNitterHtml(result.html, username);
        
        if (tweetData) {
          CircuitBreaker.recordSuccess(endpoint);
          AdaptivePolling.recordSuccess();
          return tweetData;
        } else {
          // Parse failed
          CircuitBreaker.recordFailure(endpoint);
          lastError = 'Parse failed';
        }
      } else {
        // Fetch failed
        CircuitBreaker.recordFailure(endpoint);
        lastError = result.error;
      }
      
      // Delay sebelum retry
      if (attempt < CONFIG.MAX_RETRIES) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
        await sleep(backoff);
      }
    }
    
    Logger.error(`Fetch gagal untuk @${username}: ${lastError}`);
    AdaptivePolling.recordFailure();
    return null;
  }, `fetch-${username}`);
}

// ==================== TELEGRAM ENGINE ====================

// Initialize bot
const bot = new Telegraf(CONFIG.BOT_TOKEN);

/**
 * Kirim alert ke Telegram
 */
async function sendTelegramAlert(tweetData, validation) {
  const { tweetId, username, text } = tweetData;
  const { links, codes, keywordResult } = validation;
  
  // Build message dengan MarkdownV2
  let message = `🧧 *ANGPAO SNIPPED\\!*\n\n`;
  message += `👤 @${username}\n`;
  
  // Truncate text jika terlalu panjang
  const maxTextLength = 300;
  const displayText = text.length > maxTextLength 
    ? text.substring(0, maxTextLength) + '...' 
    : text;
  message += `📝 ${escapeMarkdown(displayText)}\n\n`;
  
  // Add detected keywords
  if (keywordResult.keywords.length > 0) {
    message += `🏷️ *Keywords:* ${keywordResult.keywords.map(k => escapeMarkdown(k)).join(', ')}\n\n`;
  }
  
  // Add links
  if (links.length > 0) {
    message += `🔗 *Links:*\n`;
    links.slice(0, 5).forEach(link => {
      const shortLink = link.length > 50 ? link.substring(0, 50) + '...' : link;
      message += `• ${escapeMarkdown(shortLink)}\n`;
    });
    message += `\n`;
  }
  
  // Add codes
  if (codes.length > 0) {
    message += `🔑 *Codes:*\n`;
    codes.forEach(code => {
      message += `• \`${code}\`\n`;
    });
    message += `\n`;
  }
  
  // Add direct link
  message += `🚀 *Open:* https://x\\.com/${username}/status/${tweetId}`;
  
  try {
    await bot.telegram.sendMessage(CONFIG.CHAT_ID, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false
    });
    
    Logger.alert(`Alert terkirim untuk @${username}`);
    return true;
    
  } catch (error) {
    Logger.error(`Gagal kirim Markdown: ${error.message}`);
    
    // Fallback ke plain text
    try {
      const plainMessage = `🧧 ANGPAO SNIPPED!\n\n` +
        `👤 @${username}\n` +
        `📝 ${displayText}\n\n` +
        (links.length > 0 ? `🔗 Links:\n${links.slice(0, 5).map(l => `• ${l}`).join('\n')}\n\n` : '') +
        (codes.length > 0 ? `🔑 Codes:\n${codes.map(c => `• ${c}`).join('\n')}\n\n` : '') +
        `🚀 Open: https://x.com/${username}/status/${tweetId}`;
      
      await bot.telegram.sendMessage(CONFIG.CHAT_ID, plainMessage);
      Logger.alert(`Plain text alert terkirim untuk @${username}`);
      return true;
      
    } catch (retryError) {
      Logger.error(`Gagal kirim plain text: ${retryError.message}`);
      return false;
    }
  }
}

// ==================== MAIN LOOP ====================

/**
 * Main check updates function
 */
let isRunning = false;

async function checkUpdates() {
  // Prevent overlapping execution
  if (isRunning) {
    Logger.warn('Check sudah berjalan, skip...');
    return;
  }
  
  isRunning = true;
  Logger.info('Mulai pengecekan update...');
  
  try {
    // Process accounts dengan delay antar request
    for (let i = 0; i < CONFIG.ACCOUNTS.length; i++) {
      const username = CONFIG.ACCOUNTS[i];
      
      try {
        const tweetData = await fetchTweet(username);
        
        if (!tweetData) {
          continue;
        }
        
        const { tweetId, text } = tweetData;
        const lastId = StateManager.getLastTweetId(username);
        
        // Check jika tweet baru
        if (lastId && tweetId === lastId) {
          Logger.debug(`@${username}: Tidak ada tweet baru`);
          continue;
        }
        
        // Update state
        StateManager.update(username, tweetId);
        
        // Validate tweet
        const validation = validateTweet(text);
        
        if (validation.isValid) {
          Logger.alert(`VALID ANGPAO DITEMUKAN!`);
          Logger.alert(`  Akun: @${username}`);
          Logger.alert(`  Tweet ID: ${tweetId}`);
          Logger.alert(`  Links: ${validation.links.length}`);
          Logger.alert(`  Codes: ${validation.codes.length}`);
          Logger.alert(`  Priority: ${validation.priority}`);
          
          await sendTelegramAlert(tweetData, validation);
        } else {
          Logger.info(`@${username}: Tweet baru tapi bukan angpao`);
        }
        
      } catch (error) {
        Logger.error(`Error check @${username}: ${error.message}`);
      }
      
      // Delay antar account
      if (i < CONFIG.ACCOUNTS.length - 1) {
        await sleep(randomInRange(CONFIG.MIN_REQUEST_DELAY, CONFIG.MAX_REQUEST_DELAY));
      }
    }
    
  } catch (error) {
    Logger.error(`Error di checkUpdates: ${error.message}`);
  } finally {
    isRunning = false;
    Logger.info('Pengecekan selesai');
  }
}

/**
 * Main loop dengan adaptive interval
 */
async function mainLoop() {
  while (true) {
    await checkUpdates();
    
    const nextInterval = AdaptivePolling.getNextInterval();
    const health = CircuitBreaker.getHealthStatus();
    
    Logger.info(`Next check dalam ${Math.round(nextInterval / 1000)}s | Health: ${health.status} (${health.healthy}/${health.total})`);
    
    await sleep(nextInterval);
  }
}

// ==================== ANTI-CRASH SYSTEM ====================

/**
 * Setup global error handlers
 */
function setupAntiCrash() {
  // Handle unhandled promise rejection
  process.on('unhandledRejection', (reason, promise) => {
    Logger.error(`Unhandled Rejection: ${reason}`);
    // Jangan exit, lanjutkan running
  });
  
  // Handle uncaught exception
  process.on('uncaughtException', (error) => {
    Logger.error(`Uncaught Exception: ${error.message}`);
    // Jangan exit untuk error non-kritis
    if (error.message.includes('BOT_TOKEN') || error.message.includes('CHAT_ID')) {
      process.exit(1);
    }
  });
  
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    Logger.info('Menerima SIGINT, shutdown...');
    StateManager.save();
    process.exit(0);
  });
  
  // Handle SIGTERM (Railway stop)
  process.on('SIGTERM', () => {
    Logger.info('Menerima SIGTERM, shutdown...');
    StateManager.save();
    process.exit(0);
  });
  
  Logger.info('Anti-crash system aktif');
}

// ==================== STARTUP ====================

/**
 * Startup function
 */
async function startup() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          🧧 TELEGRAM ANGPAO SNIPER BOT v2.0.0 🧧             ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  Logger.info('Memulai sistem...');
  
  // Setup anti-crash
  setupAntiCrash();
  
  // Initialize state manager
  StateManager.load();
  
  // Initialize circuit breaker
  CircuitBreaker.init();
  
  // Log konfigurasi
  Logger.info(`Monitoring ${CONFIG.ACCOUNTS.length} akun:`);
  CONFIG.ACCOUNTS.forEach(acc => Logger.info(`  • @${acc}`));
  
  Logger.info(`Primary keywords: ${CONFIG.PRIMARY_KEYWORDS.join(', ')}`);
  Logger.info(`Context keywords: ${CONFIG.CONTEXT_KEYWORDS.join(', ')}`);
  Logger.info(`Poll interval: ${CONFIG.BASE_POLL_INTERVAL / 1000}s base (adaptive)`);
  Logger.info(`Max concurrent requests: ${CONFIG.MAX_CONCURRENT_REQUESTS}`);
  Logger.info(`Endpoints: ${CONFIG.NITTER_ENDPOINTS.length} tersedia`);
  console.log('');
  
  // Start main loop
  Logger.info('🚀 Bot aktif dan monitoring...');
  console.log('');
  
  await mainLoop();
}

// ==================== ENTRY POINT ====================

startup().catch(error => {
  Logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
