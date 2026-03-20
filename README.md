# 🧧 Telegram Angpao Sniper Bot v2.0.0

Bot Telegram production-grade untuk monitoring X (Twitter) accounts dengan sistem **rate limiting**, **circuit breaker**, dan **self-healing** yang canggih.

## 📋 Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Deployment](#deployment)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

## ✨ Fitur Utama

### 🔍 Detection Engine
- **Primary Keywords** (wajib ada minimal 1): `angpao`, `red packet`, `红包`
- **Context Keywords** (boost prioritas): `claim`, `join now`, `first come`, `limited`, `giveaway`, `free`
- **Smart Extraction**: Links dan claim codes otomatis
- **Regex Rules**: URL (`https?://[^\s]+`) dan Code (`\b[A-Z0-9]{5,}\b`)

### 🛡️ Rate Limiting & Anti-Ban
- **Request Queue**: Maksimal 2 concurrent requests
- **Per-Endpoint Limiter**: Maksimal 10 requests/menit per endpoint
- **Smart Delay**: 800-1500ms random delay antar request
- **Jitter System**: ±2 detik pada polling interval

### ⚡ Circuit Breaker
- **3 State**: CLOSED → OPEN → HALF_OPEN
- **Auto Recovery**: 60 detik cooldown setelah 3 failures
- **Smart Endpoint Selection**: Pilih endpoint dengan failure count terendah

### 📊 Adaptive Polling
- **Base Interval**: 10 detik
- **Degraded Mode**: 15-20 detik (beberapa endpoint gagal)
- **Critical Mode**: 30-60 detik (semua endpoint gagal)
- **Auto-adjustment**: Menyesuaikan kondisi endpoint

### 💾 State Management
- **In-Memory Cache**: Primary storage (cepat)
- **JSON File Fallback**: Persistent storage
- **Auto-Save**: Setiap perubahan state

### 🔧 Self-Healing
- **Auto Endpoint Switching**: Pindah ke endpoint lain saat gagal
- **Auto Recovery**: Circuit breaker recovery otomatis
- **Graceful Degradation**: Tetap berjalan meski ada error

### 🚨 Anti-Crash System
- `unhandledRejection` handler
- `uncaughtException` handler
- Graceful shutdown (SIGINT/SIGTERM)
- Never exit on transient errors

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM ANGPAO BOT v2.0                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    CONFIG    │    │    LOGGER    │    │   UTILITIES  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ STATE MANAGER│    │CIRCUIT BREAKER│   │REQUEST QUEUE │  │
│  │ (Memory+File)│    │  (3 States)  │    │  (2 max)     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  DETECTION   │    │   SCRAPER    │    │   TELEGRAM   │  │
│  │   ENGINE     │───▶│   ENGINE     │───▶│   ENGINE     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │  ADAPTIVE    │    │ ANTI-CRASH   │                      │
│  │   POLLING    │    │   SYSTEM     │                      │
│  └──────────────┘    └──────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Instalasi

### Prerequisites
- Node.js 18+
- Bun (untuk development)

### Local Development

```bash
# Clone repository
git clone https://github.com/your-username/telegram-angpao-sniper-bot.git
cd telegram-angpao-sniper-bot

# Install dependencies
bun install

# Set environment variables
export BOT_TOKEN="your_bot_token"
export CHAT_ID="your_chat_id"

# Run bot
bun run dev
```

## ⚙️ Konfigurasi

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ Ya | Token bot dari @BotFather |
| `CHAT_ID` | ✅ Ya | ID chat tujuan alert |
| `DEBUG` | ❌ Tidak | Set `true` untuk debug logs |

### Mendapatkan Credentials

**Bot Token:**
1. Buka Telegram, cari @BotFather
2. Kirim `/newbot`
3. Ikuti instruksi
4. Copy token yang diberikan

**Chat ID:**
1. Start chat dengan bot kamu
2. Buka: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Kirim pesan ke bot
4. Refresh URL, cari `"chat":{"id":`

### Konfigurasi Internal (index.js)

```javascript
const CONFIG = {
  // Akun yang dimonitor
  ACCOUNTS: ['BitgetWalletSA', 'BitgetWalletPK', 'BitgetWalletID'],
  
  // Polling
  BASE_POLL_INTERVAL: 10000,    // 10 detik
  MAX_POLL_INTERVAL: 60000,     // 60 detik (critical mode)
  
  // Rate Limiting
  MAX_CONCURRENT_REQUESTS: 2,
  MAX_REQUESTS_PER_MINUTE: 10,
  
  // Circuit Breaker
  MAX_FAILURES: 3,
  CIRCUIT_OPEN_TIME: 60000,     // 60 detik
};
```

## 🚀 Deployment

### Railway Deployment

#### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: Angpao Sniper Bot v2.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/telegram-angpao-sniper-bot.git
git push -u origin main
```

#### 2. Deploy di Railway

1. Buka [Railway](https://railway.app)
2. Login dengan GitHub
3. Klik "New Project"
4. Pilih "Deploy from GitHub repo"
5. Pilih repository kamu

#### 3. Set Environment Variables

Di Railway Dashboard:
1. Buka project
2. Klik service
3. Tab "Variables"
4. Add:
   - `BOT_TOKEN` = your_bot_token
   - `CHAT_ID` = your_chat_id

#### 4. Deploy!

Railway akan otomatis deploy. Check logs untuk memastikan bot berjalan.

### Railway Constraints

- **Ephemeral Filesystem**: State file akan reset setiap deploy
- **Limited CPU**: Hindari heavy processing
- **Memory**: Keep it low (bot ini optimized!)
- **Network**: Mungkin unstable → retry mechanism built-in

## 📊 Monitoring & Logging

### Log Levels

| Symbol | Level | Description |
|--------|-------|-------------|
| ✅ | INFO | Operasi normal |
| ⚠️ | WARN | Warning, tidak kritis |
| ❌ | ERROR | Error, tapi tidak crash |
| 🔄 | FETCH | Request ke Nitter |
| 🧧 | ALERT | Angpao terdeteksi! |
| 🚫 | BLOCK | Endpoint blocked |
| 💊 | HEAL | Self-healing active |

### Contoh Logs

```
2024-01-15 10:30:00 ✅ State loaded dari file: 3 akun
2024-01-15 10:30:00 ✅ Circuit breaker initialized untuk 5 endpoint
2024-01-15 10:30:00 ✅ Monitoring 3 akun:
2024-01-15 10:30:00 ✅   • @BitgetWalletSA
2024-01-15 10:30:00 ✅   • @BitgetWalletPK
2024-01-15 10:30:00 ✅   • @BitgetWalletID
2024-01-15 10:30:00 ✅ 🚀 Bot aktif dan monitoring...
2024-01-15 10:30:00 ✅ Mulai pengecekan update...
2024-01-15 10:30:01 🔄 @BitgetWalletSA via https://nitter.net
2024-01-15 10:30:02 ✅ Successfully fetched @BitgetWalletSA
2024-01-15 10:30:03 🧧 VALID ANGPAO DITEMUKAN!
2024-01-15 10:30:03 🧧   Akun: @BitgetWalletSA
2024-01-15 10:30:03 🧧   Tweet ID: 1234567890
2024-01-15 10:30:03 🧧   Links: 1
2024-01-15 10:30:03 🧧   Codes: 1
2024-01-15 10:30:04 🧧 Alert terkirim untuk @BitgetWalletSA
```

## 🔧 Troubleshooting

### Bot tidak menerima tweets?

**Check:**
1. Apakah Nitter endpoints accessible?
2. Apakah akun yang dimonitor ada?
3. Check Railway logs untuk errors

**Solution:**
- Bot akan otomatis switch endpoint
- Tunggu beberapa menit untuk recovery

### Tidak ada alert ke Telegram?

**Check:**
1. BOT_TOKEN benar?
2. CHAT_ID benar?
3. Kamu sudah start chat dengan bot?

**Test:**
```bash
curl "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=Test"
```

### Circuit Breaker semua OPEN?

**Artinya:**
Semua Nitter endpoints sedang di-block.

**Solution:**
- Tunggu 60 detik untuk auto-recovery
- Bot akan otomatis mencoba HALF_OPEN state
- Jika tetap gagal, mungkin Nitter down globally

### Memory tinggi?

**Biasanya karena:**
- Request queue menumpuk
- Logs terlalu banyak

**Solution:**
- Restart bot
- Kurangi concurrent requests
- Matikan DEBUG mode

## 📁 Struktur File

```
telegram-angpao-sniper-bot/
├── index.js          # Main bot code (production-ready)
├── package.json      # Dependencies & scripts
├── last.json         # State file (auto-generated)
└── README.md         # Dokumentasi
```

## 🔐 Keamanan

- Jangan commit BOT_TOKEN atau CHAT_ID ke repository
- Gunakan environment variables
- Rotate token jika ter-expose

## 📜 Lisensi

MIT License

---

**Built with ❤️ untuk angpao hunting community**
