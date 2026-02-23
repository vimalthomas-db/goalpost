# Goalpost Setup Guide

This guide explains the prerequisites and resources needed to deploy Goalpost on your Databricks workspace.

## Prerequisites

Before deploying, ensure you have:

1. **Databricks CLI** installed (`pip install databricks-cli`)
2. **Node.js 18+** for building the frontend
3. **Python 3.10+**
4. Access to a Databricks workspace with:
   - Unity Catalog enabled
   - Databricks Apps enabled
   - SQL Warehouse access

## Required Resources

### 1. Unity Catalog

You need a catalog where the app will store its data.

**Option A:** Use an existing catalog you have access to (e.g., `main`)

**Option B:** Create a new catalog:
```sql
CREATE CATALOG goalpost_catalog;
```

### 2. SQL Warehouse

A serverless or pro SQL warehouse for running queries.

**To find existing warehouses:**
- Go to **SQL Warehouses** in your workspace
- Copy the Warehouse ID from the URL or details panel

**To create a new warehouse:**
- Go to **SQL Warehouses** → **Create SQL Warehouse**
- Choose "Serverless" for best performance
- Note the Warehouse ID after creation

### 3. LLM Serving Endpoint (Optional)

Required for AI-powered goal dissection and rebalancing features.

**Foundation Model Endpoints (recommended):**
- `databricks-claude-haiku-4-5` - Fast, cost-effective
- `databricks-claude-sonnet-4-5` - More capable
- `databricks-meta-llama-3-1-70b-instruct` - Open source alternative

These are pre-configured in most workspaces. Check **Serving** → **Serving Endpoints** to see available models.

**Custom Endpoint:**
You can also deploy your own model and use its endpoint name.

## Configuration

### Option 1: Using deploy.sh (Recommended)

1. Copy the example config:
   ```bash
   cp config.env.example config.env
   ```

2. Edit `config.env`:
   ```bash
   # Required
   DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
   
   # Optional - leave empty for OAuth browser login
   DATABRICKS_PROFILE=
   
   # Optional - for AI features
   LLM_ENDPOINT=databricks-claude-haiku-4-5
   
   # Resources
   CATALOG_NAME=your_catalog
   SCHEMA_NAME=goalpost
   WAREHOUSE_ID=your_warehouse_id
   ```

3. Run deployment:
   ```bash
   ./deploy.sh
   ```

### Option 2: Using Databricks Asset Bundles (DABs)

1. Edit `databricks.yml`:
   - Set `workspace.host` to your workspace URL
   - Set variable defaults for catalog, warehouse, and LLM endpoint

2. Edit `app/app.yaml`:
   - Set environment variable values

3. Deploy:
   ```bash
   databricks bundle deploy --target dev
   databricks bundle run goalpost --target dev
   ```

## Post-Deployment

After deployment, the app's service principal needs permissions:

1. **Catalog access:**
   ```sql
   GRANT USE_CATALOG ON CATALOG <catalog_name> TO `<service_principal_id>`;
   GRANT USE_SCHEMA ON SCHEMA <catalog_name>.<schema_name> TO `<service_principal_id>`;
   GRANT ALL PRIVILEGES ON SCHEMA <catalog_name>.<schema_name> TO `<service_principal_id>`;
   ```

2. **Warehouse access:**
   - Grant CAN_USE permission on the SQL Warehouse to the app's service principal

The `deploy.sh` script handles these permissions automatically.

## Troubleshooting

### "Not Found" error
- Ensure the frontend is built (`npm run build` in `app/frontend`)
- Redeploy the app

### "LLM_ENDPOINT is not configured"
- Set the `LLM_ENDPOINT` environment variable in `app/app.yaml`
- Or leave it empty to disable AI features

### "INSUFFICIENT_PERMISSIONS" errors
- Run `./deploy.sh permissions` to re-grant permissions
- Or manually grant permissions using the SQL commands above

### Database tables don't exist
- Run `./deploy.sh` which creates tables automatically
- Or use `databricks bundle run init_tables` with DABs
