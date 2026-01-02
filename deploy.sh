#!/bin/bash
# ============================================================================
# Goalpost - Fully Automated Deployment
# ============================================================================
# Creates everything needed:
#   1. Catalog (or uses existing)
#   2. SQL Warehouse (or finds existing)
#   3. Schema and tables
#   4. App with all permissions
#
# Usage:
#   ./deploy.sh         # Full automated deployment
#   ./deploy.sh teardown # Remove everything
# ============================================================================

# Don't use set -e as it causes premature exits during async operations
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load config
if [ ! -f "config.env" ]; then
    echo -e "${RED}Error: config.env not found!${NC}"
    exit 1
fi
source config.env

DATABRICKS_HOST="${DATABRICKS_HOST%/}"
SCHEMA_NAME="${SCHEMA_NAME:-goalpost}"
APP_NAME="goalpost"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Goalpost Automated Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo "Workspace: $DATABRICKS_HOST"
echo ""

# ============================================================================
# AUTH: Setup Databricks CLI authentication
# ============================================================================
setup_auth() {
    # If no profile specified, use OAuth with host directly
    if [ -z "$DATABRICKS_PROFILE" ]; then
        echo "No profile specified, using OAuth..."
        
        # Check if already authenticated to this host
        local current_host=$(databricks auth env --host "$DATABRICKS_HOST" 2>/dev/null | grep DATABRICKS_HOST | cut -d'=' -f2)
        
        if [ "$current_host" = "$DATABRICKS_HOST" ]; then
            echo -e "${GREEN}✓ Already authenticated to $DATABRICKS_HOST${NC}"
            # Use host directly instead of profile
            DATABRICKS_PROFILE=""
            CLI_AUTH="--host $DATABRICKS_HOST"
            return 0
        fi
        
        echo "Opening browser for OAuth login to $DATABRICKS_HOST..."
        databricks auth login --host "$DATABRICKS_HOST"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ OAuth login successful${NC}"
            # Get the profile name that was created (usually based on host)
            local oauth_profile=$(grep -B1 "$DATABRICKS_HOST" ~/.databrickscfg 2>/dev/null | grep '^\[' | tr -d '[]' | tail -1)
            if [ -n "$oauth_profile" ]; then
                CLI_AUTH="--profile $oauth_profile"
                echo "  Using profile: $oauth_profile"
            else
                CLI_AUTH="--host $DATABRICKS_HOST"
            fi
            return 0
        else
            echo -e "${RED}OAuth login failed${NC}"
            exit 1
        fi
    fi
    
    # Profile-based authentication
    local cfg_file="$HOME/.databrickscfg"
    local profile_exists=0
    local host_matches=0
    
    if [ -f "$cfg_file" ]; then
        local in_profile=0
        while IFS= read -r line; do
            if [[ "$line" == "[$DATABRICKS_PROFILE]" ]]; then
                in_profile=1
                profile_exists=1
            elif [[ "$line" == "["* ]]; then
                in_profile=0
            elif [[ $in_profile -eq 1 ]] && [[ "$line" == host* ]]; then
                local existing_host=$(echo "$line" | cut -d'=' -f2 | tr -d ' ')
                if [ "$existing_host" = "$DATABRICKS_HOST" ]; then
                    host_matches=1
                fi
            fi
        done < "$cfg_file"
    fi
    
    if [ $profile_exists -eq 1 ] && [ $host_matches -eq 1 ]; then
        echo -e "${GREEN}✓ Using CLI profile: $DATABRICKS_PROFILE${NC}"
        CLI_AUTH="--profile $DATABRICKS_PROFILE"
        return 0
    fi
    
    if [ $profile_exists -eq 1 ] && [ $host_matches -eq 0 ]; then
        echo -e "${YELLOW}Profile '$DATABRICKS_PROFILE' exists but points to different host${NC}"
    fi
    
    # Offer OAuth or token
    echo ""
    echo "Setup authentication for $DATABRICKS_HOST"
    echo "  1) OAuth (browser login - recommended)"
    echo "  2) Personal Access Token"
    read -p "Choose [1/2]: " auth_choice
    
    if [ "$auth_choice" = "1" ]; then
        # OAuth login and save to profile
        echo "Opening browser for OAuth login..."
        databricks auth login --host "$DATABRICKS_HOST" $CLI_AUTH
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ OAuth profile configured${NC}"
            CLI_AUTH="--profile $DATABRICKS_PROFILE"
            return 0
        else
            echo -e "${RED}OAuth login failed${NC}"
            exit 1
        fi
    else
        # Token-based auth
        echo "Enter your Personal Access Token:"
        read -s token
        echo ""
        
        # Remove old profile if exists
        if [ -f "$cfg_file" ] && [ $profile_exists -eq 1 ]; then
            local temp_file="${cfg_file}.tmp"
            local skip=0
            > "$temp_file"
            while IFS= read -r line || [[ -n "$line" ]]; do
                if [[ "$line" == "[$DATABRICKS_PROFILE]" ]]; then skip=1
                elif [[ "$line" == "["* ]]; then skip=0; fi
                [ $skip -eq 0 ] && echo "$line" >> "$temp_file"
            done < "$cfg_file"
            mv "$temp_file" "$cfg_file"
        fi
        
        # Add profile with token
        echo "" >> "$cfg_file"
        echo "[$DATABRICKS_PROFILE]" >> "$cfg_file"
        echo "host = $DATABRICKS_HOST" >> "$cfg_file"
        echo "token = $token" >> "$cfg_file"
        
        echo -e "${GREEN}✓ Token profile configured${NC}"
        CLI_AUTH="--profile $DATABRICKS_PROFILE"
    fi
}

# ============================================================================
# CATALOG: Create or use catalog
# ============================================================================
setup_catalog() {
    echo ""
    echo -e "${BLUE}[1/6] Setting up catalog...${NC}"
    
    # CATALOG_NAME should always have a value (default: goalpost_catalog)
    if [ -z "$CATALOG_NAME" ]; then
        CATALOG_NAME="goalpost_catalog"
    fi
    
    echo "  Catalog: $CATALOG_NAME"
    
    # Try to create the catalog
    local result=$(databricks api post /api/2.1/unity-catalog/catalogs \
        --json "{\"name\": \"$CATALOG_NAME\", \"comment\": \"Goalpost application data\"}" \
        $CLI_AUTH 2>&1)
    
    if echo "$result" | grep -q '"name"'; then
        echo -e "  ${GREEN}✓ Created catalog: $CATALOG_NAME${NC}"
    elif echo "$result" | grep -q "CATALOG_ALREADY_EXISTS"; then
        echo -e "  ${GREEN}✓ Catalog exists: $CATALOG_NAME${NC}"
    else
        # Check if we can at least access it
        local check=$(databricks api get "/api/2.1/unity-catalog/catalogs/$CATALOG_NAME" $CLI_AUTH 2>&1)
        if echo "$check" | grep -q '"name"'; then
            echo -e "  ${GREEN}✓ Using catalog: $CATALOG_NAME${NC}"
        else
            echo -e "${RED}Error: Cannot create or access catalog '$CATALOG_NAME'${NC}"
            echo "Either:"
            echo "  1. Ask an admin to create the catalog, or"
            echo "  2. Update CATALOG_NAME in config.env to an existing catalog you can access"
            exit 1
        fi
    fi
    
    # VERIFY: Catalog is accessible
    echo "  Verifying catalog access..."
    local verify=$(databricks api get "/api/2.1/unity-catalog/catalogs/$CATALOG_NAME" $CLI_AUTH 2>&1)
    if echo "$verify" | grep -q '"name"'; then
        echo -e "  ${GREEN}✓ Catalog verified${NC}"
    else
        echo -e "${RED}Error: Cannot access catalog after creation${NC}"
        exit 1
    fi
}

# ============================================================================
# WAREHOUSE: Create or find SQL warehouse
# ============================================================================
wait_for_warehouse() {
    local wh_id=$1
    echo "  Waiting for warehouse to be ready..."
    
    local max_wait=180
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local state=$(databricks api get "/api/2.0/sql/warehouses/$wh_id" $CLI_AUTH 2>/dev/null | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
        
        if [ "$state" = "RUNNING" ]; then
            echo -e "  ${GREEN}✓ Warehouse is running${NC}"
            return 0
        elif [ "$state" = "STOPPED" ]; then
            echo "  Starting warehouse..."
            databricks api post "/api/2.0/sql/warehouses/$wh_id/start" $CLI_AUTH > /dev/null 2>&1 || true
        fi
        
        sleep 10
        waited=$((waited + 10))
        echo "  Waiting... ($waited s, state: ${state:-unknown})"
    done
    
    echo -e "${RED}Warehouse did not start in time${NC}"
    return 1
}

setup_warehouse() {
    echo ""
    echo -e "${BLUE}[2/6] Setting up SQL warehouse...${NC}"
    
    # If already specified, just ensure it's running
    if [ -n "$WAREHOUSE_ID" ]; then
        echo "  Using specified warehouse: $WAREHOUSE_ID"
        wait_for_warehouse "$WAREHOUSE_ID"
        return $?
    fi
    
    # Check for existing warehouses
    local warehouses=$(databricks api get /api/2.0/sql/warehouses $CLI_AUTH 2>/dev/null)
    
    # Find a running warehouse first
    WAREHOUSE_ID=$(echo "$warehouses" | grep -B5 '"state":"RUNNING"' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$WAREHOUSE_ID" ]; then
        echo -e "  ${GREEN}✓ Found running warehouse: $WAREHOUSE_ID${NC}"
        update_config_warehouse
        return 0
    fi
    
    # Try stopped warehouse
    WAREHOUSE_ID=$(echo "$warehouses" | grep -B5 '"state":"STOPPED"' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$WAREHOUSE_ID" ]; then
        echo "  Found stopped warehouse: $WAREHOUSE_ID"
        update_config_warehouse
        wait_for_warehouse "$WAREHOUSE_ID"
        return $?
    fi
    
    # Try to find goalpost_warehouse by name (might be in STARTING or DELETING state)
    local all_warehouses=$(databricks api get /api/2.0/sql/warehouses $CLI_AUTH 2>/dev/null)
    WAREHOUSE_ID=$(echo "$all_warehouses" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for wh in data.get('warehouses', []):
        if wh.get('name') == 'goalpost_warehouse':
            print(wh.get('id', ''))
            break
except: pass
" 2>/dev/null)
    
    if [ -n "$WAREHOUSE_ID" ]; then
        echo "  Found existing goalpost_warehouse: $WAREHOUSE_ID"
        update_config_warehouse
        wait_for_warehouse "$WAREHOUSE_ID"
        return $?
    fi
    
    # Create new serverless warehouse
    echo "  Creating new serverless warehouse..."
    local result=$(databricks api post /api/2.0/sql/warehouses \
        --json '{"name": "goalpost_warehouse", "cluster_size": "2X-Small", "max_num_clusters": 1, "auto_stop_mins": 10, "enable_serverless_compute": true, "warehouse_type": "PRO"}' \
        $CLI_AUTH 2>&1)
    
    WAREHOUSE_ID=$(echo "$result" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$WAREHOUSE_ID" ]; then
        # Check again if it was created by name collision
        WAREHOUSE_ID=$(databricks api get /api/2.0/sql/warehouses $CLI_AUTH 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for wh in data.get('warehouses', []):
        if wh.get('name') == 'goalpost_warehouse':
            print(wh.get('id', ''))
            break
except: pass
" 2>/dev/null)
        
        if [ -n "$WAREHOUSE_ID" ]; then
            echo "  Found warehouse after create attempt: $WAREHOUSE_ID"
            update_config_warehouse
            wait_for_warehouse "$WAREHOUSE_ID"
            return $?
        fi
        
        echo -e "${RED}Error: Could not create warehouse${NC}"
        echo "$result"
        exit 1
    fi
    
    echo -e "  ${GREEN}✓ Created warehouse: $WAREHOUSE_ID${NC}"
    update_config_warehouse
    wait_for_warehouse "$WAREHOUSE_ID"
}

update_config_warehouse() {
    # Update config.env with the warehouse ID for future runs
    if grep -q "^WAREHOUSE_ID=$" config.env 2>/dev/null; then
        sed -i.bak "s/^WAREHOUSE_ID=$/WAREHOUSE_ID=$WAREHOUSE_ID/" config.env
        rm -f config.env.bak
        echo "  (Updated config.env with WAREHOUSE_ID)"
    fi
}

# ============================================================================
# TABLES: Create schema and tables
# ============================================================================
setup_tables() {
    echo ""
    echo -e "${BLUE}[3/6] Creating schema and tables...${NC}"
    
    run_sql() {
        local sql="$1"
        local result=$(databricks api post /api/2.0/sql/statements \
            --json '{"warehouse_id": "'"$WAREHOUSE_ID"'", "statement": "'"$sql"'", "wait_timeout": "50s"}' \
            $CLI_AUTH 2>&1)
        
        if echo "$result" | grep -q '"FAILED"'; then
            echo -e "  ${RED}SQL Error${NC}"
            echo "$result" | grep -o '"message":"[^"]*"' | head -1
            return 1
        fi
        return 0
    }
    
    verify_table() {
        local table="$1"
        local result=$(databricks api post /api/2.0/sql/statements \
            --json '{"warehouse_id": "'"$WAREHOUSE_ID"'", "statement": "DESCRIBE '"$CATALOG_NAME.$SCHEMA_NAME.$table"'", "wait_timeout": "30s"}' \
            $CLI_AUTH 2>&1)
        
        if echo "$result" | grep -q '"SUCCEEDED"'; then
            return 0
        fi
        return 1
    }
    
    # Create schema
    echo "  Creating schema..."
    if ! run_sql "CREATE SCHEMA IF NOT EXISTS $CATALOG_NAME.$SCHEMA_NAME"; then
        echo -e "${RED}Failed to create schema${NC}"
        exit 1
    fi
    
    # Verify schema
    local schema_check=$(databricks api post /api/2.0/sql/statements \
        --json '{"warehouse_id": "'"$WAREHOUSE_ID"'", "statement": "SHOW TABLES IN '"$CATALOG_NAME.$SCHEMA_NAME"'", "wait_timeout": "30s"}' \
        $CLI_AUTH 2>&1)
    if echo "$schema_check" | grep -q '"SUCCEEDED"'; then
        echo -e "  ${GREEN}✓ Schema verified: $CATALOG_NAME.$SCHEMA_NAME${NC}"
    else
        echo -e "${RED}Failed to verify schema${NC}"
        exit 1
    fi
    
    # Create tables
    echo "  Creating tables..."
    
    run_sql "CREATE TABLE IF NOT EXISTS $CATALOG_NAME.$SCHEMA_NAME.users (user_id STRING, email STRING, display_name STRING, created_at TIMESTAMP, updated_at TIMESTAMP) USING DELTA"
    if verify_table "users"; then
        echo -e "  ${GREEN}✓ users${NC}"
    else
        echo -e "${RED}Failed to create users table${NC}"; exit 1
    fi
    
    run_sql "CREATE TABLE IF NOT EXISTS $CATALOG_NAME.$SCHEMA_NAME.goals (goal_id STRING, user_id STRING, title STRING, description STRING, target_count INT, current_count INT, start_date DATE, end_date DATE, priority INT, status STRING, color STRING, tags ARRAY<STRING>, created_at TIMESTAMP, updated_at TIMESTAMP, completed_at TIMESTAMP) USING DELTA"
    if verify_table "goals"; then
        echo -e "  ${GREEN}✓ goals${NC}"
    else
        echo -e "${RED}Failed to create goals table${NC}"; exit 1
    fi
    
    run_sql "CREATE TABLE IF NOT EXISTS $CATALOG_NAME.$SCHEMA_NAME.milestones (milestone_id STRING, goal_id STRING, user_id STRING, title STRING, description STRING, due_date DATE, completed BOOLEAN, sort_order INT, created_at TIMESTAMP, updated_at TIMESTAMP) USING DELTA"
    if verify_table "milestones"; then
        echo -e "  ${GREEN}✓ milestones${NC}"
    else
        echo -e "${RED}Failed to create milestones table${NC}"; exit 1
    fi
    
    run_sql "CREATE TABLE IF NOT EXISTS $CATALOG_NAME.$SCHEMA_NAME.tasks (task_id STRING, goal_id STRING, milestone_id STRING, user_id STRING, title STRING, description STRING, week_start DATE, week_end DATE, year_week STRING, target_count INT, completed_count INT, status STRING, priority INT, sort_order INT, assignee STRING, notes STRING, created_at TIMESTAMP, updated_at TIMESTAMP, completed_at TIMESTAMP, rolled_over_from STRING) USING DELTA"
    if verify_table "tasks"; then
        echo -e "  ${GREEN}✓ tasks${NC}"
    else
        echo -e "${RED}Failed to create tasks table${NC}"; exit 1
    fi
    
    echo -e "  ${GREEN}✓ All tables verified${NC}"
}

# ============================================================================
# BUILD: Build frontend and prepare files
# ============================================================================
build_app() {
    echo ""
    echo -e "${BLUE}[4/6] Building application...${NC}"
    
    # Generate app.yaml
    cat > app/app.yaml << EOF
command:
  - uvicorn
  - backend.main:app
  - --host
  - 0.0.0.0
  - --port
  - "8000"

env:
  - name: CATALOG_NAME
    value: "$CATALOG_NAME"
  - name: SCHEMA_NAME
    value: "$SCHEMA_NAME"
  - name: WAREHOUSE_ID
    value: "$WAREHOUSE_ID"
  - name: LLM_ENDPOINT
    value: "$LLM_ENDPOINT"
  - name: DEBUG
    value: "$DEBUG"
EOF
    
    # Copy requirements
    cp app/backend/requirements.txt app/requirements.txt
    
    # Build frontend
    echo "  Building frontend..."
    cd app/frontend
    npm install --silent 2>/dev/null || npm install
    npm run build 2>/dev/null
    cd ../..
    
    echo -e "  ${GREEN}✓ App built${NC}"
}

# ============================================================================
# UPLOAD: Upload to workspace
# ============================================================================
upload_files() {
    echo ""
    echo -e "${BLUE}[5/6] Uploading files...${NC}"
    
    local user_email=$(databricks current-user me $CLI_AUTH 2>/dev/null | grep -o '"userName":"[^"]*"' | cut -d'"' -f4)
    WORKSPACE_PATH="/Workspace/Users/${user_email}/goalpost"
    
    # Clean
    find app/backend -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # Upload
    databricks workspace mkdirs "$WORKSPACE_PATH" $CLI_AUTH 2>/dev/null || true
    databricks workspace import "${WORKSPACE_PATH}/app.yaml" --file app/app.yaml --overwrite --format AUTO $CLI_AUTH
    databricks workspace import "${WORKSPACE_PATH}/requirements.txt" --file app/requirements.txt --overwrite --format AUTO $CLI_AUTH
    databricks workspace import-dir app/frontend/dist "${WORKSPACE_PATH}/frontend/dist" --overwrite $CLI_AUTH 2>/dev/null
    databricks workspace import-dir app/backend "${WORKSPACE_PATH}/backend" --overwrite $CLI_AUTH 2>/dev/null
    
    echo -e "  ${GREEN}✓ Files uploaded${NC}"
}

# ============================================================================
# DEPLOY: Create app and grant permissions
# ============================================================================
deploy_app() {
    echo ""
    echo -e "${BLUE}[6/6] Deploying app...${NC}"
    
    # Check if app exists
    local app_info=$(databricks apps get $APP_NAME $CLI_AUTH 2>&1)
    
    if echo "$app_info" | grep -q "does not exist"; then
        echo "  Creating app..."
        
        # Create app using the API
        local create_result=$(databricks api post /api/2.0/apps \
            --json "{\"name\": \"$APP_NAME\", \"description\": \"Goal tracking with AI\"}" \
            $CLI_AUTH 2>&1)
        
        if echo "$create_result" | grep -q '"name"'; then
            echo -e "  ${GREEN}✓ App created${NC}"
        else
            echo -e "${RED}Failed to create app:${NC}"
            echo "$create_result"
            exit 1
        fi
        
        echo "  Waiting for app to initialize..."
        local max_wait=120
        local waited=0
        while [ $waited -lt $max_wait ]; do
            local app_state=$(databricks apps get $APP_NAME $CLI_AUTH 2>/dev/null | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$app_state" ] && [ "$app_state" != "CREATING" ]; then
                break
            fi
            sleep 10
            waited=$((waited + 10))
            echo "  Initializing... ($waited s)"
        done
        
        # Grant permissions after app is created
        grant_permissions
    else
        echo "  App already exists, updating permissions..."
        grant_permissions
    fi
    
    # Deploy code
    echo "  Deploying code..."
    local deploy_result
    local max_attempts=10
    local attempt=0
    local deployed=0
    
    while [ $attempt -lt $max_attempts ] && [ $deployed -eq 0 ]; do
        attempt=$((attempt + 1))
        deploy_result=$(databricks apps deploy $APP_NAME --source-code-path "$WORKSPACE_PATH" $CLI_AUTH 2>&1)
        
        if echo "$deploy_result" | grep -q '"SUCCEEDED"'; then
            echo -e "  ${GREEN}✓ Code deployed successfully${NC}"
            deployed=1
        elif echo "$deploy_result" | grep -q '"deployment_id"'; then
            echo -e "  ${GREEN}✓ Deployment started${NC}"
            deployed=1
        elif echo "$deploy_result" | grep -q "active deployment in progress"; then
            echo "  Attempt $attempt: Waiting for existing deployment..."
            sleep 15
        else
            echo "  Attempt $attempt: $deploy_result"
            sleep 10
        fi
    done
    
    if [ $deployed -eq 0 ]; then
        echo -e "${RED}  Failed to deploy after $max_attempts attempts${NC}"
        echo "  Try manually: databricks apps deploy $APP_NAME --source-code-path $WORKSPACE_PATH $CLI_AUTH"
        return 1
    fi
    
    # Wait for app to be running
    echo "  Waiting for app to start..."
    local max_wait=180
    local waited=0
    local app_running=0
    
    while [ $waited -lt $max_wait ]; do
        local app_info=$(databricks apps get $APP_NAME $CLI_AUTH 2>/dev/null)
        
        # Check if app_status contains RUNNING
        if echo "$app_info" | grep -q '"app_status"' && echo "$app_info" | grep -A2 '"app_status"' | grep -q '"state":"RUNNING"'; then
            echo -e "  ${GREEN}✓ App is running!${NC}"
            app_running=1
            break
        fi
        
        # Check for errors
        if echo "$app_info" | grep -q '"state":"ERROR"' || echo "$app_info" | grep -q '"state":"FAILED"'; then
            echo -e "${RED}  App failed to start${NC}"
            echo "$app_info" | grep -o '"message":"[^"]*"' | head -1
            break
        fi
        
        sleep 10
        waited=$((waited + 10))
        local current_state=$(echo "$app_info" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo "  Starting... ($waited s, state: ${current_state:-initializing})"
    done
    
    if [ $app_running -eq 0 ] && [ $waited -ge $max_wait ]; then
        echo -e "${YELLOW}  App did not start within ${max_wait}s${NC}"
        echo "  Check: databricks apps get $APP_NAME $CLI_AUTH"
    fi
    
    # Get URL
    APP_URL=$(databricks apps get $APP_NAME $CLI_AUTH 2>/dev/null | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
}

# ============================================================================
# PERMISSIONS: Grant all required permissions
# ============================================================================
grant_permissions() {
    echo "  Granting permissions..."
    
    # Wait a moment for service principal to be ready
    sleep 5
    
    local app_info=$(databricks apps get $APP_NAME $CLI_AUTH 2>/dev/null)
    local sp_id=$(echo "$app_info" | grep -o '"service_principal_client_id":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$sp_id" ]; then
        # Try again after more time
        sleep 10
        app_info=$(databricks apps get $APP_NAME $CLI_AUTH 2>/dev/null)
        sp_id=$(echo "$app_info" | grep -o '"service_principal_client_id":"[^"]*"' | cut -d'"' -f4)
    fi
    
    if [ -z "$sp_id" ]; then
        echo -e "  ${YELLOW}Warning: Could not get service principal - you may need to grant permissions manually${NC}"
        echo "  Run: ./deploy.sh permissions"
        return
    fi
    
    echo "  Service Principal: $sp_id"
    
    grant_sql() {
        local sql="$1"
        local result=$(databricks api post /api/2.0/sql/statements \
            --json '{"warehouse_id": "'"$WAREHOUSE_ID"'", "statement": "'"$sql"'", "wait_timeout": "30s"}' \
            $CLI_AUTH 2>&1)
        if echo "$result" | grep -q '"SUCCEEDED"'; then
            return 0
        fi
        return 1
    }
    
    # 1. Warehouse access
    echo "  Granting warehouse access..."
    local wh_result=$(databricks api patch "/api/2.0/permissions/warehouses/$WAREHOUSE_ID" \
        --json '{"access_control_list": [{"service_principal_name": "'"$sp_id"'", "permission_level": "CAN_USE"}]}' \
        $CLI_AUTH 2>&1)
    if echo "$wh_result" | grep -q '"CAN_USE"'; then
        echo -e "  ${GREEN}✓ Warehouse CAN_USE${NC}"
    else
        echo -e "  ${YELLOW}Warehouse permission may have failed${NC}"
    fi
    
    # 2. LLM endpoint access
    if [ -n "$LLM_ENDPOINT" ]; then
        echo "  Granting LLM endpoint access..."
        local ep_id=$(databricks api get "/api/2.0/serving-endpoints/$LLM_ENDPOINT" $CLI_AUTH 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$ep_id" ]; then
            local ep_result=$(databricks api patch "/api/2.0/permissions/serving-endpoints/$ep_id" \
                --json '{"access_control_list": [{"service_principal_name": "'"$sp_id"'", "permission_level": "CAN_QUERY"}]}' \
                $CLI_AUTH 2>&1)
            if echo "$ep_result" | grep -q '"CAN_QUERY"'; then
                echo -e "  ${GREEN}✓ LLM endpoint CAN_QUERY${NC}"
            else
                echo -e "  ${YELLOW}LLM endpoint permission may have failed${NC}"
            fi
        else
            echo -e "  ${YELLOW}LLM endpoint '$LLM_ENDPOINT' not found${NC}"
        fi
    fi
    
    # 3. Database access
    echo "  Granting database access..."
    if grant_sql "GRANT USE_CATALOG ON CATALOG $CATALOG_NAME TO \`$sp_id\`"; then
        echo -e "  ${GREEN}✓ USE_CATALOG${NC}"
    else
        echo -e "  ${YELLOW}USE_CATALOG may have failed${NC}"
    fi
    
    if grant_sql "GRANT USE_SCHEMA ON SCHEMA $CATALOG_NAME.$SCHEMA_NAME TO \`$sp_id\`"; then
        echo -e "  ${GREEN}✓ USE_SCHEMA${NC}"
    else
        echo -e "  ${YELLOW}USE_SCHEMA may have failed${NC}"
    fi
    
    for table in users goals tasks milestones; do
        if grant_sql "GRANT ALL PRIVILEGES ON TABLE $CATALOG_NAME.$SCHEMA_NAME.$table TO \`$sp_id\`"; then
            echo -e "  ${GREEN}✓ $table privileges${NC}"
        else
            echo -e "  ${YELLOW}$table privileges may have failed${NC}"
        fi
    done
    
    echo -e "  ${GREEN}✓ Permissions complete${NC}"
}

# ============================================================================
# TEARDOWN: Remove everything
# ============================================================================
teardown() {
    echo ""
    echo -e "${YELLOW}Tearing down Goalpost...${NC}"
    
    # Need warehouse to drop schema
    if [ -z "$WAREHOUSE_ID" ]; then
        local warehouses=$(databricks api get /api/2.0/sql/warehouses $CLI_AUTH 2>/dev/null)
        WAREHOUSE_ID=$(echo "$warehouses" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    fi
    
    # Delete app and wait for it to be gone
    echo "  Deleting app..."
    databricks apps delete $APP_NAME $CLI_AUTH > /dev/null 2>&1 || true
    
    # Wait for app to be fully deleted
    local max_wait=60
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local check=$(databricks apps get $APP_NAME $CLI_AUTH 2>&1)
        if echo "$check" | grep -q "does not exist"; then
            break
        fi
        sleep 5
        waited=$((waited + 5))
        echo "  Waiting for app deletion... ($waited s)"
    done
    
    # Get catalog name
    if [ -z "$CATALOG_NAME" ]; then
        CATALOG_NAME="goalpost_catalog"
    fi
    
    # Drop schema
    if [ -n "$WAREHOUSE_ID" ]; then
        echo "  Dropping schema..."
        databricks api post /api/2.0/sql/statements \
            --json '{"warehouse_id": "'"$WAREHOUSE_ID"'", "statement": "DROP SCHEMA IF EXISTS '"$CATALOG_NAME.$SCHEMA_NAME"' CASCADE", "wait_timeout": "30s"}' \
            $CLI_AUTH > /dev/null 2>&1 || true
    fi
    
    # Delete files
    echo "  Deleting files..."
    local user_email=$(databricks current-user me $CLI_AUTH 2>/dev/null | grep -o '"userName":"[^"]*"' | cut -d'"' -f4)
    databricks workspace delete "/Workspace/Users/${user_email}/goalpost" --recursive $CLI_AUTH 2>/dev/null || true
    
    echo -e "${GREEN}✓ Teardown complete${NC}"
}

# ============================================================================
# MAIN
# ============================================================================
main() {
    local command="${1:-deploy}"
    
    case "$command" in
        teardown|destroy|clean)
            setup_auth
            teardown
            ;;
        deploy|"")
            setup_auth
            setup_catalog
            setup_warehouse
            setup_tables
            build_app
            upload_files
            deploy_app
            
            echo ""
            echo -e "${GREEN}============================================${NC}"
            echo -e "${GREEN}  Deployment Complete!${NC}"
            echo -e "${GREEN}============================================${NC}"
            echo ""
            echo "Configuration:"
            echo "  Catalog:   $CATALOG_NAME"
            echo "  Schema:    $SCHEMA_NAME"
            echo "  Warehouse: $WAREHOUSE_ID"
            echo "  LLM:       ${LLM_ENDPOINT:-'(none)'}"
            echo ""
            if [ -n "$APP_URL" ] && [ "$APP_URL" != "Unavailable" ]; then
                echo -e "App URL: ${GREEN}$APP_URL${NC}"
            else
                echo "App URL: (check Databricks Apps in a moment)"
            fi
            echo ""
            ;;
        *)
            echo "Usage: ./deploy.sh [deploy|teardown]"
            exit 1
            ;;
    esac
}

main "$@"
