## Hyperliquid Wallet Perp Signal System

This project implements an on-chain perpetual trading activity monitor, designed to detect and alert on collective trading signals from a predefined set of wallets on the Hyperliquid decentralized exchange. The system is built using Cloudflare Workers for serverless backend logic and Cloudflare D1 for a serverless SQL database, with a React-based admin panel for configuration and monitoring.

### Key Features:

-   **Wallet Activity Tracking**: Monitors specified wallet addresses for perpetual trading activities (open, close, modify positions).
-   **Signal Detection**: Identifies collective trading signals based on configurable thresholds (e.g., N wallets opening positions in the same direction for the same pair within a time window).
-   **Real-time Price Monitoring**: Tracks asset prices and monitors signals for Stop Loss (SL) and Take Profit (TP) levels.
-   **Telegram Notifications**: Sends real-time alerts for new signals, SL hits, and TP hits.
-   **Performance Tracking**: Calculates and stores performance metrics for signals and individual wallets.
-   **Admin Panel**: A user-friendly React frontend for managing monitored wallets, viewing signals, and configuring system parameters.
-   **Robustness**: Implements comprehensive error handling, retry mechanisms, and API rate limiting.
-   **Scalability**: Designed for horizontal scaling using Cloudflare Workers and Queues.
-   **Security**: Focus on secure environment variable handling and SQL injection prevention.

### Architecture Overview:

The system comprises several interconnected Cloudflare Workers and a D1 database:

1.  **Ingestion Worker**: Responsible for polling the Hyperliquid API for wallet activity and pushing relevant events to a queue.
2.  **Signal Processor Worker**: Consumes events from the ingestion queue, applies signal detection logic, and stores signals in the D1 database. It also publishes notification events.
3.  **Price Monitor Worker**: Periodically fetches real-time prices, checks open signals against their configured SL/TP levels, and updates signal statuses. It also publishes notification events.
4.  **Notifier Worker**: Consumes notification events and sends formatted alerts to Telegram.
5.  **Performance Tracker Worker**: Periodically analyzes closed signals and wallet activities to calculate and store performance metrics.
6.  **Admin Panel (React)**: A static frontend application that interacts with the Workers (via HTTP endpoints) to manage configurations and display data.

### Technologies Used:

-   **Cloudflare Workers**: Serverless execution environment for backend logic.
-   **Cloudflare D1**: Serverless SQL database for persistent storage.
-   **Cloudflare Queues**: Message queuing service for inter-worker communication.
-   **TypeScript**: For type-safe and maintainable backend code.
-   **React**: For building the interactive admin panel.
-   **Node.js**: For local development and testing utilities.

## Setup and Local Development

### Prerequisites:

-   Node.js (v18 or higher)
-   npm (or yarn/pnpm)
-   Cloudflare Wrangler CLI (for deployment)

### 1. Clone the Repository:

```bash
git clone https://github.com/your-repo/hyperliquid-signal-system.git
cd hyperliquid-signal-system
```

### 2. Install Dependencies:

Install root dependencies:

```bash
npm install
```

Install backend worker dependencies:

```bash
cd backend/workers/ingestion && npm install
cd ../signal-processor && npm install
cd ../price-monitor && npm install
cd ../notifier && npm install
cd ../performance-tracker && npm install
```

Install frontend dependencies:

```bash
cd ../../frontend/admin-panel && npm install
```

### 3. Local Development with Mock API (Recommended):

For local development and testing without deploying to Cloudflare, you can use the provided mock API server.

**Start the Mock Server:**

```bash
cd backend/test
npm install # if not already installed
npm start
```

This will start a mock server on `http://localhost:3001` that simulates Hyperliquid, KuCoin, and Telegram APIs. The frontend is configured to use this mock server in development mode.

**Run Backend Workers Locally (using `wrangler dev` with mock APIs):**

Each worker can be run locally using `wrangler dev`. You will need to configure `wrangler.toml` files to point to your local mock API server and D1 database (if you set up a local D1).

Example `wrangler.toml` snippet for local development (in each worker directory):

```toml
# ... other configurations

[vars]
HYPERLIQUID_API_BASE = "http://localhost:3001/info"
KUCOIN_API_BASE = "http://localhost:3001/api/v1"
TELEGRAM_API_BASE = "http://localhost:3001/bot"

# For local D1, uncomment and configure
# [[d1_databases]]
# binding = "DB"
# database_name = "hyperliquid-signals-dev"
# database_id = "<YOUR_LOCAL_D1_ID>"
```

**Run Frontend Admin Panel Locally:**

```bash
cd frontend/admin-panel
npm run dev
```

This will start the React development server, usually on `http://localhost:5173`.

### 4. Running Tests:

**Integration Tests (using Mock API):**

```bash
cd backend/test
node integration-test.js
```

This script runs a suite of tests against the mock API to verify core functionalities.

## Deployment to Cloudflare

Refer to the `DEPLOYMENT.md` file for detailed instructions on deploying the system to Cloudflare Workers and D1.

## Project Structure:

```
hyperliquid-signal-system/
├── backend/
│   ├── db/
│   │   └── migrations/             # D1 database schema migrations
│   ├── shared/                   # Shared TypeScript types, utilities, API clients
│   └── workers/                  # Cloudflare Workers projects
│       ├── ingestion/
│       │   └── src/index.ts      # Ingestion Worker source
│       │   └── wrangler.toml     # Worker configuration
│       ├── signal-processor/
│       │   └── src/index.ts      # Signal Processor Worker source
│       │   └── wrangler.toml
│       ├── price-monitor/
│       │   └── src/index.ts      # Price Monitor Worker source
│       │   └── wrangler.toml
│       ├── notifier/
│       │   └── src/index.ts      # Notifier Worker source
│       │   └── wrangler.toml
│       └── performance-tracker/
│           └── src/index.ts      # Performance Tracker Worker source
│           └── wrangler.toml
├── frontend/
│   └── admin-panel/              # React Admin Panel project
│       ├── public/
│       ├── src/
│       │   ├── components/       # UI components
│       │   └── App.jsx           # Main application component
│       └── package.json
├── backend/test/                 # Local mock API server and integration tests
├── .gitignore
├── LICENSE
├── package.json                  # Root package.json
├── README.md                     # This file
└── DEPLOYMENT.md                 # Deployment instructions
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.


