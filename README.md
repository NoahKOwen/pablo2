# XNRT - Community Earning Platform

A React PWA off-chain gamification platform where users earn in-app utility tokens (XNRT) through staking, mining, referrals, and task completion.

## Features

- **Staking System** - Four-tiered staking with varying APY and automated daily rewards
- **Mining Sessions** - 24-hour automated mining with XP to XNRT conversion
- **Referral Program** - 3-level commission chain with network visualization and leaderboards
- **Task Completion** - Earn rewards by completing platform tasks
- **Daily Check-in** - Streak-based rewards with anti-exploit measures
- **Achievements** - Auto-unlocking achievements with XP rewards
- **Deposit/Withdrawal** - USDT to XNRT conversion with BSC blockchain integration
- **Push Notifications** - Web Push with VAPID authentication
- **PWA Support** - Full offline capabilities with service worker

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS with custom cosmic theme
- Shadcn/ui + Radix UI primitives
- TanStack Query for data management
- Wouter for routing
- Framer Motion for animations
- Recharts for data visualization

### Backend
- Express.js with TypeScript
- PostgreSQL (Neon) database
- Drizzle ORM (schema) + Prisma ORM (operations)
- Passport.js for authentication
- ethers.js for blockchain integration

### Infrastructure
- Progressive Web App (vite-plugin-pwa + Workbox)
- Helmet for security headers
- Rate limiting
- Session management with PostgreSQL store

## Project Structure

```
├── client/                 # Frontend React application
│   ├── public/            # Static assets and PWA icons
│   └── src/               # React components and pages
├── server/                # Backend Express application
│   ├── auth/              # JWT and authentication logic
│   ├── email/             # Email templates and service
│   ├── routes/            # API route modules (15+ feature routers)
│   ├── services/          # Business logic services
│   └── storage/           # Data access layer (14 domain modules)
├── shared/                # Shared types and schemas
├── prisma/                # Prisma schema and migrations
└── drizzle/               # Drizzle schema definitions
```

## Prerequisites

- Node.js 20+
- pnpm package manager
- PostgreSQL database (Neon recommended)

## Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `SESSION_SECRET` | Secret for express-session (auto-generated if not set) |
| `MASTER_SEED` | BIP39 mnemonic for HD wallet derivation |

### Blockchain (BSC)
| Variable | Description |
|----------|-------------|
| `RPC_BSC_URL` | BSC RPC endpoint |
| `USDT_BSC_ADDRESS` | USDT contract address on BSC |
| `XNRT_WALLET` | Platform wallet address |
| `BSC_CONFIRMATIONS` | Required confirmations (default: 15) |
| `BSC_SCAN_INTERVAL_MS` | Scanner polling interval in ms (default: 180000) |
| `ENABLE_SCANNER` | Enable deposit scanner (true/false) |

> **Note**: Set `ENABLE_SCANNER=true` to activate the automated deposit scanner, which monitors user deposit addresses and auto-credits XNRT after the configured number of blockchain confirmations.

### Optional
| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | Push notification public key |
| `VAPID_PRIVATE_KEY` | Push notification private key |
| `BREVO_API_KEY` | Email service API key |
| `SMTP_*` | SMTP configuration for emails |

## Getting Started

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Set up environment variables**
   - Copy required variables to your environment
   - Add secrets via Replit Secrets or `.env` file

3. **Initialize database**
   ```bash
   pnpm db:push
   ```

4. **Seed initial data** (optional)
   ```bash
   pnpm seed:tasks
   ```

5. **Start development server**
   ```bash
   pnpm dev
   ```

The application will be available at `http://localhost:5000`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Run production build |
| `pnpm check` | TypeScript type checking |
| `pnpm db:push` | Push schema changes to database |
| `pnpm seed:tasks` | Seed platform task definitions |
| `pnpm seed:user-tasks` | Assign tasks to existing users |

## Deployment

The application is configured for Replit Autoscale deployment:

```bash
# Build
pnpm run build

# Run production
NODE_ENV=production node dist/index.js
```

## Architecture Notes

- **Modular Backend**: Routes and storage split into domain-specific modules
- **Dual ORM**: Drizzle for schema definition, Prisma for database operations
- **Atomic Operations**: All earning mechanisms use database transactions
- **HD Wallet**: Unique deposit addresses per user via BIP44 derivation
- **Lazy Loading**: All authenticated pages are code-split for performance

For detailed technical documentation, see [replit.md](./replit.md).

## License

MIT
