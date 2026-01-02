# Goalpost

AI-powered goal tracking and task management application built on Databricks.

## Features

- **AI-Powered Goal Planning**: Uses LLM to break down goals into specific, actionable tasks
- **Smart Task Distribution**: Automatically distributes tasks across weeks based on available time
- **Intelligent Rebalancing**: AI-assisted workload rebalancing when priorities change
- **Timeline View**: Navigate tasks across weeks, months, and years
- **Databricks Native**: Built entirely on Databricks platform (Apps, Unity Catalog, Serving Endpoints)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Databricks Apps                          │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  React Frontend │───▶│     FastAPI Backend             │ │
│  │  (TypeScript)   │    │  ┌──────────┐ ┌──────────────┐  │ │
│  └─────────────────┘    │  │ Dissect  │ │  Rebalance   │  │ │
│                         │  │  Agent   │ │    Agent     │  │ │
│                         │  └────┬─────┘ └──────┬───────┘  │ │
│                         └───────┼──────────────┼──────────┘ │
└─────────────────────────────────┼──────────────┼────────────┘
                                  │              │
                    ┌─────────────▼──────────────▼─────────────┐
                    │         Databricks Services              │
                    │  ┌────────────┐  ┌────────────────────┐  │
                    │  │ SQL        │  │ Model Serving      │  │
                    │  │ Warehouse  │  │ (Llama 4, etc.)    │  │
                    │  └─────┬──────┘  └────────────────────┘  │
                    │        │                                  │
                    │  ┌─────▼──────────────────────────────┐  │
                    │  │     Unity Catalog (Delta Lake)     │  │
                    │  │  users │ goals │ tasks │ milestones │  │
                    │  └────────────────────────────────────┘  │
                    └──────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Databricks CLI installed (`pip install databricks-cli`)
- Access to a Databricks workspace
- Node.js 18+ (for frontend build)
- Python 3.10+

### Configuration

1. Copy and edit the config file:
```bash
cp config.env.example config.env
# Edit config.env with your workspace details
```

2. Configure `config.env`:
```env
# Required
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com

# Optional - leave empty for OAuth browser login
DATABRICKS_PROFILE=

# Optional - for AI features
LLM_ENDPOINT=your-llm-endpoint

# Resources (defaults provided)
CATALOG_NAME=goalpost_catalog
SCHEMA_NAME=goalpost
WAREHOUSE_ID=
```

### Deploy

```bash
./deploy.sh
```

The script will:
1. Authenticate (OAuth or token)
2. Create/verify catalog and schema
3. Create/find SQL warehouse
4. Create database tables
5. Build and upload the application
6. Deploy as a Databricks App
7. Grant all required permissions

### Teardown

```bash
./deploy.sh teardown
```

## Project Structure

```
goalpost/
├── app/
│   ├── backend/           # FastAPI backend
│   │   ├── agents/        # AI agents (dissect, rebalance)
│   │   ├── routers/       # API endpoints
│   │   ├── models.py      # Pydantic models
│   │   ├── db.py          # Database client
│   │   └── main.py        # App entry point
│   ├── frontend/          # React frontend
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       └── api/
│   ├── app.yaml           # Databricks App config (generated)
│   └── requirements.txt   # Python dependencies
├── config.env             # Deployment configuration
├── deploy.sh              # Deployment script
└── README.md
```

## Authentication

The app uses Databricks SSO - users authenticate via their Databricks identity. Data is isolated per user via `user_id` filtering on all queries.

## AI Components

- **Dissect Agent**: Analyzes goals and generates specific, actionable tasks using LLM
- **Rebalance Agent**: Redistributes tasks based on availability and priorities

Both agents use Databricks Model Serving endpoints (Llama 4, or your custom endpoint).

## License

MIT
